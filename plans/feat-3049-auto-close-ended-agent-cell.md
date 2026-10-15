# Close an agent cell when its session ends on its own (#3049)

## Problem

An agent cell whose agent ends by itself (`/exit`, Ctrl+C twice, a crash) stays on the grid with
`[session ended]`. Cells started by an agent through `spawnBackgroundChat` are placed automatically,
so they accumulate.

## What the `exit` frame can and cannot say

- Under tmux the pty is the tmux CLIENT. A client killed from outside leaves the session running
  (#1496), and `handlePtyExit` tells `reap` (session over) from `keep` (client only) — but the frame
  was sent before that decision and without it. A cell that closed on every `exit` would drop a
  live agent.
- The exit code is the client's, not the agent's: with node-pty + `tmux new-session`, an inner
  `exit 3` arrives as `exitCode: 0`. So "keep a crashed cell" cannot be decided from the code.

## Change

1. `server/session/pty/pty-exit.ts`: split the decision (`decidePtyExit`) from applying it
   (`applyPtyExit`); `reportPtyExit` decides, sends the frame with `ended: disposition === "reap"`,
   then applies. The three tmux-backed exit handlers (claude, the shared agent relay, launchers) use
   it. `sendExitAndClose` takes `ended` explicitly; a Run command passes `false`.
2. Client: `sessionEndedOf(frame)` reads the flag; `onExit` carries it; `Terminal.vue` emits it.
3. `TerminalCell.vue`: on `exit` with `ended`, close through the normal close path, so the cell is
   recorded as recently closed and `terminal-reopen` resumes the conversation. The rule is a pure
   function (`shouldAutoCloseEndedCell`).

## Deliberately left out

- Worktree cells: their close asks whether to keep or remove the worktree, and popping that dialog
  (and enlarging the cell for it) unprompted is a different decision. They keep today's banner.
- Shell / launcher / Run cells: unchanged.
- The `keep` case still shows `[session ended]` although the session is alive; unchanged.
- No setting to turn it off; the reopen list is the safety net.
