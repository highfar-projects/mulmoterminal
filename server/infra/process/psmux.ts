// psmux (https://github.com/psmux/psmux) is a native Windows tmux that installs itself as
// `tmux.exe`, so on Windows it is what the tmux path runs on. These rules decide, from its `-V`
// answer and the environment, which of its differences from a real tmux need handling. Pure: the
// caller runs `tmux -V` and caches the result (see tmux.ts).

export type PsmuxVersion = readonly [number, number, number];

// The first release with PSMUX_VT_INPUT (psmux#766).
export const PSMUX_VT_INPUT_SINCE: PsmuxVersion = [3, 4, 0];

/** Whether `tmux -V` came from psmux. It answers `tmux 3.x` on the first line, like a real tmux, and
 *  names itself only on the second. */
export function isPsmuxVersion(versionStdout: string): boolean {
  return /\bpsmux\b/i.test(versionStdout);
}

/** psmux's own release, from the `psmux 3.4.0 (…)` line — the first line's `tmux 3.x` is the tmux it
 *  imitates. Null when it cannot be read. */
export function psmuxVersionOf(versionStdout: string): PsmuxVersion | null {
  const match = /\bpsmux\s+(\d+)\.(\d+)\.(\d+)/i.exec(versionStdout);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isAtLeast(version: PsmuxVersion, floor: PsmuxVersion): boolean {
  const differing = version.findIndex((part, index) => part !== floor[index]);
  if (differing === -1) return true;
  return (version[differing] ?? 0) > (floor[differing] ?? 0);
}

/** Whether the psmux client is started with `PSMUX_VT_INPUT=1`.
 *
 *  A psmux client under a pseudoconsole (node-pty) otherwise gets key records from the console host,
 *  which strips the bracketed-paste markers, so psmux guesses a paste by timing: the auto-run Enter
 *  written after a paste lands INSIDE it and the prompt is never sent, and two Esc written together
 *  arrive as one. `PSMUX_VT_INPUT=0` in the server's environment keeps the old route. */
export function psmuxVtInputFor(version: PsmuxVersion | null, envValue: string | undefined): boolean {
  if (envValue === "0") return false;
  return version !== null && isAtLeast(version, PSMUX_VT_INPUT_SINCE);
}

/** The startup line for a psmux, or a warning when it is too old for the VT input route. */
export function psmuxStartupNote(version: PsmuxVersion | null): string {
  const wanted = PSMUX_VT_INPUT_SINCE.join(".");
  if (version === null) return `[tmux] psmux detected, but its version could not be read — ${wanted} or newer is required`;
  const found = version.join(".");
  if (isAtLeast(version, PSMUX_VT_INPUT_SINCE)) return `[tmux] running on psmux ${found}`;
  return `[tmux] psmux ${found} is older than ${wanted}: an auto-run prompt may stay unsent and Esc may be dropped — upgrade with \`winget upgrade psmux\``;
}
