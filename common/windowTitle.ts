// The browser window's title, which is what the taskbar, Alt+Tab and a window switcher show.
//
// One machine can run two servers side by side — one on Windows and one inside WSL, each on its own
// port — and both pages used to say "mulmoterminal", so the two windows could only be told apart by
// looking inside them. The server says whether it runs inside WSL (`wsl` on GET /api/config, a
// fact about the server rather than a setting) and the page names itself after it.
//
// Shared because both sides decide from it: the server ships the base title in index.html, the page
// replaces it once the config arrives, and the two must not disagree on the base.

/** What index.html's `<title>` says, and what the page keeps when the server is not inside WSL. */
export const BASE_WINDOW_TITLE = "mulmoterminal";

export function windowTitleFor(serverOnWsl: boolean): string {
  return serverOnWsl ? `${BASE_WINDOW_TITLE} (WSL)` : BASE_WINDOW_TITLE;
}
