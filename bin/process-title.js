// What this process is CALLED — in `ps`, and on Windows in the terminal tab (#1820).
//
// Without it every part of MulmoTerminal is a `node` among the user's other `node`s, because the
// launcher is a `#!/usr/bin/env node` script: npx and a global install look identical, and
// searching Activity Monitor for "mulmoterminal" finds nothing. The user who has lost the terminal
// they started it from has no name to search for.
//
// `process.title` is three different features wearing one name, and the differences decide what
// this file may promise:
//
//   Linux   — prctl(PR_SET_NAME) (the first 15 characters, so the base name must fit inside that)
//             plus an argv overwrite. `ps` and `pkill` both see it.
//   macOS   — the argv overwrite alone, as far as anything observable goes. `ps` and `pkill` see
//             it; `top` does not, so Activity Monitor is expected not to either.
//   Windows — SetConsoleTitleW and NOTHING else. The image name stays `node.exe`, so Task Manager,
//             `Get-Process` and `taskkill /IM` are untouched. What it does rename is the console —
//             i.e. the Windows Terminal tab, which is the thing the reporter lost. Worth doing for
//             that alone, but it is why `mulmoterminal stop` exists rather than being optional.
//
// Node ignores the failure: the setter discards uv_set_process_title's return value, so this can
// never throw, and a Windows process with no console attached simply keeps its old name.
//
// Assign ONCE. On macOS every assignment dlopens ApplicationServices and CoreFoundation to reach
// LaunchServices — measured at 14.6ms for the first and ~7ms for each one after it.
const BASE = "mulmoterminal";

/**
 * The title for a server (or launcher) serving `port`.
 *
 * The port is in the string to pay back what naming the process costs: the same argv overwrite
 * that puts `mulmoterminal` in `ps` erases the `--port` and the install path that were, until
 * now, the documented way to find this process. Appending it keeps `pkill mulmoterminal` working
 * — both platforms match unanchored, and `mulmoterminal` fits Linux's 15-character `comm` with
 * room to spare — while letting `pkill -f 'mulmoterminal :34567'` pick one worktree out of
 * several.
 *
 * Anything that is not a port gives the bare name rather than a title claiming one nobody is
 * serving. The range is the one `parsePortArg` already enforces on `--port` — the two describe the
 * same thing, and a title is no place to introduce a second opinion about what a port is.
 */
const MAX_PORT = 65535;

export function processTitle(port) {
  const n = Number(port);
  return Number.isInteger(n) && n > 0 && n <= MAX_PORT ? `${BASE} :${n}` : BASE;
}

/** Name this process. Best-effort by construction — see above, it cannot throw. */
export function setProcessTitle(port) {
  process.title = processTitle(port);
}
