// The throwaway server the width probes measure on: an ABSOLUTE `-S` socket, never the live
// `-L mulmoterminal` one, in the environment a session gets.
import path from "node:path";
import type { TmuxWidthTable } from "../../../common/tmuxWidthTable.js";
import { sanitizePtyEnv, withFallbackLocale } from "./pty-env.js";
import { spawnCaptureAsync } from "./spawnCapture.js";

export interface ThrowawayTmux {
  run(args: string[]): Promise<{ ok: boolean; stdout: string }>;
}

/** A measured table and the version of the tmux (or psmux) it was measured on. */
export interface Measurement {
  table: TmuxWidthTable;
  version: string | null;
}

// The environment a session gets, so the probe counts in the same locale; minus what would make a
// bare tmux client reach a server other than the one named by `-S`.
const TMUX_CLIENT_VARS: ReadonlySet<string> = new Set(["TMUX", "TMUX_PANE"]);

/** The PATH the probe's server and panes get: the running node's folder first, so the psmux probe's
 *  `node` is this one even when the server was started by an absolute path. Exported for its spec. */
export function probePath(currentPath: string | undefined, execPath: string, paths: Pick<typeof path, "dirname" | "delimiter"> = path): string {
  const nodeDir = paths.dirname(execPath);
  return currentPath ? `${nodeDir}${paths.delimiter}${currentPath}` : nodeDir;
}

function probeEnv(): NodeJS.ProcessEnv {
  const sessionEnv = withFallbackLocale(sanitizePtyEnv(process.env, path.delimiter), process.platform);
  const kept = Object.fromEntries(Object.entries(sessionEnv).filter(([name]) => !TMUX_CLIENT_VARS.has(name)));
  // Windows spells it Path; whichever key the environment uses is the one replaced.
  const pathKey = Object.keys(kept).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  return { ...kept, [pathKey]: probePath(kept[pathKey], process.execPath) };
}

export const throwawayTmux = (dir: string): ThrowawayTmux => {
  const env = probeEnv();
  return {
    run: async (args) => {
      const result = await spawnCaptureAsync("tmux", ["-S", path.join(dir, "s"), ...args], { env });
      return { ok: result.status === 0, stdout: result.stdout };
    },
  };
};

export async function serverVersion(tmux: ThrowawayTmux): Promise<string | null> {
  const version = await tmux.run(["display-message", "-p", "#{version}"]);
  return version.ok && version.stdout.trim() !== "" ? version.stdout.trim() : null;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
