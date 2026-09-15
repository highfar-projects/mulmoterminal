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
// A file lookup has neither problem: nothing is interpreted, it is just candidate names on disk.
// WHICH candidates is the whole remaining question, and it is not this file's to invent — it is
// `server/infra/has-binary.ts`'s, because "can we launch it" and "what would we launch" must not
// answer differently. `test/bin/gate-agrees-with-spawn.spec.ts` compares the two over generated
// machines rather than trusting these comments.
//
// The trade, said out loud: this reports a binary that EXISTS and is executable, not one that
// exits 0. A present-but-broken install now reads as present. That is what the server's own
// pre-spawn check already concluded, and the alternative is executing a string the user supplied.
import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// The candidate names node-pty can actually START on Windows — `.exe`/`.com` as PE images, and
// `.cmd`/`.bat` through the cmd.exe wrapper resolve-bin builds. Deliberately NOT the user's
// PATHEXT: a stock one also carries `.VBS`, `.JS`, `.WSF`, `.MSC`, none of which CreateProcessW
// will run, so honouring it passed a machine whose every session then died with node-pty's empty
// `File not found:`. Reading it also cut the list the other way — `PATHEXT=.PS1` hid a real
// `claude.exe` — which is why the answer is a closed set and not an environment variable.
//
// `""` belongs to it for the reason resolve-bin states: node-pty's own pre-spawn lookup compares
// file names EXACTLY, so an extension-less PE image on PATH is one it finds, and refusing it would
// refuse a host that spawns fine today.
const WINDOWS_LAUNCHABLE_EXTENSIONS = ["", ".exe", ".com", ".cmd", ".bat"];

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
  // Windows has no execute bit that means anything here — the file TYPE is what decides, and the
  // extension loop has already applied it.
  isExecutable: (candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
};

// "" first so an explicit `foo.exe` is found as itself rather than as `foo.exe.EXE`.
const extensionsFor = (platform) => (platform === "win32" ? WINDOWS_LAUNCHABLE_EXTENSIONS : [""]);

// A Windows PATH entry may be QUOTED — `"C:\Program Files\tools"` — which the shells strip and a
// plain join would not, leaving a path that matches nothing. Same rule as the server's
// `windowsSearchDirectories` (server/infra/resolve-bin.ts); `C:\Program Files` is the canonical
// path that needs the quotes, so this is the common case rather than an exotic one.
// The current directory is on neither platform's list. cmd.exe searches it and POSIX shells do
// not, but what launches an agent is node-pty on both — and the directory THIS process sits in is
// the launch directory, never the one the PTY will run in.
const searchDirectories = (platform, env) => {
  const raw = env.PATH || env.Path || "";
  if (platform === "win32") {
    return raw
      .split(";")
      .map((entry) => entry.replace(/^"(.*)"$/, "$1"))
      .filter((entry) => entry !== "");
  }
  return raw.split(":").filter((entry) => entry !== "");
};

// Can this process enumerate everything execvp would search? Two cases where it cannot, both taken
// from server/infra/has-binary.ts, which reasoned them out first:
//
//   - an UNSET PATH is not an empty one. execvp falls back to its own built-in default
//     (confstr _CS_PATH), which is not readable from here.
//   - a NON-ABSOLUTE entry — `tools`, `.`, `../bin`, and the EMPTY entry, which POSIX reads as the
//     current directory (`PATH=/usr/bin:`, `/a::/b`) — is resolved against the CHILD's working
//     directory, not this process's.
//
// This matters because this gate REFUSES START-UP. The repo's own rule for a preflight in that
// position: one that cannot answer must never be the thing that says no (Codex round 6 of #2084,
// which measured /bin/sh running ./faux with PATH=":/usr/bin").
const canEnumeratePosixPath = (env) => env.PATH !== undefined && env.PATH.split(":").every((entry) => entry.startsWith("/"));

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
  // EXACTLY, with no extension appended. Handed a path, node-pty checks that path and nothing else
  // (CreateProcessW's own `.exe` guess never runs, because the spawn dies at node-pty's check
  // first) — so `CLAUDE_BIN=C:\tools\claude` beside a `claude.exe` is a setup that does not work,
  // and a gate that passed it would only move the failure to the first session.
  if (namesAPath(cmd)) return runnable(cmd);
  const extensions = extensionsFor(platform);
  // Answered BEFORE the search, because the answer is "we cannot tell" rather than "not found".
  if (platform !== "win32" && !canEnumeratePosixPath(env)) return true;
  // The path module has to MATCH the platform being asked about, not the one this process runs on.
  // Without it the Windows branch builds `C:\npm/codex.cmd` when exercised from macOS — which is
  // how the Windows tests here found their own harness bug before they found a real one.
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  return searchDirectories(platform, env).some((dir) => extensions.some((ext) => runnable(join(dir, cmd + ext))));
}
