// When an agent cell closes itself because its session ended (#3049). Shared because the server
// measures the startup window for its exit log and the browser decides the close from the same one.

// Under this, an exit is a failure to start rather than an ending. Claude Code takes ~1.5s to
// draw its first frame here, so anything inside this window is a process that never got going.
export const STARTUP_WINDOW_MS = 2000;

export interface EndedCellExit {
  /** The server reaped the session — not merely lost the tmux client, which leaves the agent running. */
  sessionEnded: boolean;
  /** How long the pty lived, or null when the frame named none. Under tmux the exit code is the
   *  client's and reads 0 even for an agent that failed to start, so the lifetime is what is left
   *  to tell a launch failure, whose banner must stay readable, from an agent that was ended. */
  lifetimeMs: number | null;
  /** A worktree cell's close asks whether to keep the worktree; that is not asked unprompted. */
  worktreeCell: boolean;
}

export function shouldCloseEndedCell(exit: EndedCellExit): boolean {
  if (!exit.sessionEnded || exit.worktreeCell || exit.lifetimeMs === null) return false;
  return exit.lifetimeMs >= STARTUP_WINDOW_MS;
}
