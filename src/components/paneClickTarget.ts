// Whether the grid is in a state where a path clicked in terminal output can open in the
// Files pane (#910). Split out of TerminalGrid because it is a decision, not wiring — and
// because every "no" here is a case where the pane would otherwise show the wrong file.
//
// Saying no costs the user nothing: the click keeps the route it had before (a new tab, or
// the full-screen Files view), so these can be strict.

export interface PaneClickState {
  /** Is there room for the pane on screen? Always beside an enlarged cell; on the tiled grid only
   *  while a pane is already up beside the tiles (#3027) — a click must not open one there. */
  roomForPane: boolean;
  /** The project dir of the cell the pane answers for — the enlarged one, else the one it is on. */
  paneCellCwd: string | null;
  /** The dir the pane's tree is ACTUALLY rooted at — null before it has first opened. It
   *  trails `paneCellCwd` when a re-root could not be saved out of, and a path relative to
   *  that cell would then resolve against the directory the pane stayed on. */
  paneCwd: string | null;
}

/** Can a click from the session running in `cwd` be shown in the pane right now? */
export function paneCanShowClick(state: PaneClickState, cwd: string): boolean {
  if (!state.roomForPane) return false;
  // Every cell stays mounted while one is enlarged (the filmstrip), and every tile is on screen
  // beside a tiled pane, so a click can come from a cell the pane is not about.
  if (state.paneCellCwd !== cwd) return false;
  return state.paneCwd === null || state.paneCwd === cwd;
}
