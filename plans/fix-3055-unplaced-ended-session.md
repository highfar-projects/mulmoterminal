# Don't adopt an unplaced session that ended on its own (#3055)

## Problem

A session an agent opens with `spawnBackgroundChat` while no grid is open is marked unplaced, and
the next grid adopts it. Only an attach cleared the mark, so a session whose agent ended before any
grid saw it was still adopted — as a resumed conversation, or (with no transcript) a freshly minted
session with a new agent. Reproduced with an isolated server and a stand-in `claude`.

## Change

`reportPtyExit` (`server/session/pty/pty-exit.ts`) asks the question #3049 already answers for an
open cell — `shouldCloseEndedCell` — and, when the cell would have closed itself, calls
`markSessionPlaced` so the session is no longer waiting for a home.

Kept on purpose (the mark stays, so a grid still adopts the session):

- a launch failure (ended inside the startup window, not reattached) — the next cell is the only
  place the failure can show;
- a lost tmux client (`keep`) and a stale exit after the id was reused (`gone`);
- a worktree session, whose close asks about the worktree;
- a server restart, which runs no exit handler at all.
