// Is this command present and runnable?
//
// RESOLVED, never executed. That is the whole design, and it is what makes both of the bugs this
// file was created for impossible rather than handled:
//
//   1. INJECTION. The command can be a `<AGENT>_BIN` the user set (#2082). The original probe ran
//      `execSync(`${cmd} ${arg}`)`, so a shell both SPLIT it and INTERPRETED it — measured:
//        CLAUDE_BIN="/…/My Tools/claude"  -> REFUSED, split at the space
//        CLAUDE_BIN="true; touch /tmp/X"  -> the `touch` RAN
//   2. WINDOWS `.cmd`. `execFileSync` cannot launch a `.bat`/`.cmd` at all — node documents it,
//      and node refuses it outright since CVE-2024-27980. An npm-installed `codex` on Windows IS
//      `codex.cmd`, so an argv probe reports it missing on the one platform where the shell probe
//      used to work (Codex round 2 of #2084).
//
// A file lookup has neither problem: nothing is interpreted, and PATHEXT is just more candidates.
// It is also the answer `server/infra/has-binary.ts` already gives on the server side, for the same
// reason — "can we launch it" and "what would we launch" must not answer differently.
//
// The trade, said out loud: this reports a binary that EXISTS and is executable, not one that
// exits 0. A present-but-broken install now reads as present. That is what the server's own
// pre-spawn check already concluded, and the alternative is executing a string the user supplied.
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// What Windows tries when a name carries no extension. The real PATHEXT is consulted first; this is
// the fallback for an environment that does not set it, and matches what cmd.exe assumes.
const WINDOWS_DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

/** A name CreateProcess/execvp resolves itself rather than by searching PATH. */
const namesAPath = (cmd) => cmd.includes("/") || cmd.includes("\\");

const realProbe = {
  isFile: (candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  },
  // Windows has no execute bit that means anything here — the extension is what decides, and the
  // PATHEXT loop has already applied it.
  isExecutable: (candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
};

const extensionsFor = (platform, env) => {
  if (platform !== "win32") return [""];
  const configured = (env.PATHEXT || WINDOWS_DEFAULT_PATHEXT).split(";").filter(Boolean);
  // "" first so an explicit `foo.exe` is found as itself rather than as `foo.exe.EXE`.
  return ["", ...configured];
};

const searchDirectories = (platform, env) => {
  const raw = env.PATH || env.Path || "";
  const dirs = raw.split(platform === "win32" ? ";" : ":").filter(Boolean);
  // cmd.exe looks in the current directory first; POSIX shells deliberately do not.
  return platform === "win32" ? [".", ...dirs] : dirs;
};

/**
 * True when `cmd` names something this machine could launch.
 *
 * `platform`, `env` and `probe` are injected so the WINDOWS rules are testable from any host —
 * which matters more than usual here, because the Windows branch is the one that regressed and the
 * one no developer on macOS can exercise (reveal-argv.spec.ts makes the same argument).
 */
export function hasCommand(cmd, { platform = process.platform, env = process.env, probe = realProbe } = {}) {
  if (typeof cmd !== "string" || cmd === "") return false;
  const runnable = (candidate) => probe.isFile(candidate) && (platform === "win32" || probe.isExecutable(candidate));
  const extensions = extensionsFor(platform, env);
  if (namesAPath(cmd)) return extensions.some((ext) => runnable(cmd + ext));
  // The path module has to MATCH the platform being asked about, not the one this process runs on.
  // Without it the Windows branch builds `C:\npm/codex.cmd` when exercised from macOS — which is
  // how the Windows tests here found their own harness bug before they found a real one.
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  return searchDirectories(platform, env).some((dir) => extensions.some((ext) => runnable(join(dir, cmd + ext))));
}
