// Runs `claude --help` to learn which --permission-mode values this binary accepts (#2352).
//
// Synchronous because it runs inside ptySpawn's pre-flight, beside the binary check. It costs one short run per binary, not per cell — the answer is kept per resolved
// path and mtime, and `claude update` rewrites the file, so an updated binary is asked again.
import { statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Captured } from "../../infra/spawnCapture.js";
import { resolvePtyLaunchForEnv, type PtyLaunch } from "../../infra/resolve-bin.js";
import { diagnoseBinary } from "../../infra/has-binary.js";
import { SpawnPermissionModeError } from "../../session/pty-spawn.js";
import { permissionModeChoices, permissionModeRefusal } from "./claude-permission-modes.js";

const HELP_TIMEOUT_MS = 5_000;

export type RunHelp = (launch: PtyLaunch) => Captured;

// A Windows `claude.cmd` comes back as cmd.exe plus a command line already quoted for it, which has
// to reach cmd.exe untouched — the same line node-pty is handed for the cell itself.
// SIGKILL because this blocks the event loop: on the default SIGTERM, a wrapper that ignores it
// keeps spawnSync waiting past the timeout for as long as it likes.
export const createHelpRunner =
  (timeoutMs: number): RunHelp =>
  (launch) => {
    const verbatim = typeof launch.args === "string";
    const args = typeof launch.args === "string" ? [launch.args] : launch.args;
    const result = spawnSync(launch.file, args, { encoding: "utf8", timeout: timeoutMs, killSignal: "SIGKILL", windowsVerbatimArguments: verbatim });
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };

const runHelp = createHelpRunner(HELP_TIMEOUT_MS);

function modifiedAtMs(file: string): number | null {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/** The accepted modes, or null when the binary cannot be found, run, or read. Never throws.
 *  `env` must be the CHILD's, as for the binary check: sanitizePtyEnv drops PATH entries, so
 *  process.env can find a different `claude` than the one the cell would start. */
export function createPermissionModeProbe(run: RunHelp = runHelp) {
  const known = new Map<string, string[] | null>();
  function readChoices(file: string, env: NodeJS.ProcessEnv): string[] | null {
    try {
      const help = run(resolvePtyLaunchForEnv(file, ["--help"], env));
      return help.status === 0 ? permissionModeChoices(help.stdout) : null;
    } catch {
      return null;
    }
  }
  return function acceptedPermissionModes(claudeBin: string, env: NodeJS.ProcessEnv): string[] | null {
    const diagnosis = diagnoseBinary(claudeBin, env);
    // A relative answer is resolved by the cell against ITS cwd; run from here it could name another file.
    if (diagnosis.kind !== "ok" || !path.isAbsolute(diagnosis.path)) return null;
    const key = `${diagnosis.path}\0${modifiedAtMs(diagnosis.path) ?? "unknown"}`;
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    const choices = readChoices(diagnosis.path, env);
    known.set(key, choices);
    return choices;
  };
}

const acceptedPermissionModes = createPermissionModeProbe();

/** Throws the cell's explanation when the Claude Code `childEnv` resolves would reject `mode`. */
export function refuseUnsupportedPermissionMode(claudeBin: string, mode: string, childEnv: NodeJS.ProcessEnv): void {
  const refusal = permissionModeRefusal(mode, acceptedPermissionModes(claudeBin, childEnv), claudeBin);
  if (refusal) throw new SpawnPermissionModeError(refusal);
}
