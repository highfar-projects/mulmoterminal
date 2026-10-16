# fix: a route that ends a session and closes its cell (#3067)

## Problem

`POST /api/session/:id/terminate` reaps the session before its pty dies, so the exit reads as
`gone` and the cell is sent `ended: false` — it stays as `[session ended]`. An agent that replaces its
worker at each milestone leaves one dead cell per milestone.

## Decisions (on #3067)

- A separate, documented route rather than changing terminate: `POST /api/session/:id/close`.
  terminate stays as it is, because the cell's own restart (#1918) and token switch (#2950) call it
  with the cell attached; with terminate unchanged, nothing needs to opt out.
- Both routes mark the session placed, so a deliberately ended session is never adopted later by a
  grid that did not have it open (#3055). A restarting cell is attached, so it is placed anyway.
- HTTP only; not an MCP tool.

## Design

- `PtyEntry.closeRequested`, set by the close route BEFORE the reap (the reap kills the pty, whose
  exit sends the frame).
- `sessionEndedForCell(disposition, closeRequested)` (pure, pty-exit.ts): `reap`, or `gone` with a
  close requested. It decides both the frame's `ended` and the unplaced mark.
- The cell then closes by the same rule as `/exit` (`shouldCloseEndedCell`): a worktree cell keeps its
  banner, as it does for `/exit`.
