# fix: repaint a tmux client without blocking the server (#3189)

## Problem

`tmuxRedrawClient` runs `list-clients` and `refresh-client` synchronously. It runs once per terminal
on a reattach (#1073) and, since #3186, when the page's cell-width table changes. Each call holds
the event loop for two tmux round trips, so a page with many live terminals stalls the server.

## Decision

- `tmuxRedrawClient` uses the module's async spawn (`tmuxAsync`) and returns a promise. The
  connection's `redrawTerminal` dep fires it without awaiting.
- Order is unchanged: the reattach path still asks for the repaint after the resize frame; the pty
  resize already reaches tmux asynchronously through the client process.
- `spawnCaptureAsync` resolves on failure, so a fire-and-forget call cannot reject unhandled.

## Verification

- A spec mocks both spawns: the repaint goes through the async one only, returns before tmux
  answers, and a failed `list-clients` repaints nothing without rejecting. Break-verified against
  the synchronous version.
- On a real session over the websocket: a quiet pane sent nothing, and one `redraw` frame brought a
  full repaint.
- In a browser: a server restart, then a page loaded before the width measurement ended; the
  reattached screen was whole and the rows lined up after the late table's repaint.
