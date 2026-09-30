# feat: the row-2 and path-menu operations as cell actions (#2653)

Adds six entries to `CELL_SELF_ACTIONS` (#2635), so each is a keymap shortcut, a command-palette
row and a header `action` at once:

| name | what it calls |
|---|---|
| `terminal-copy-code` | `CopyCodeBlock.copyLastBlock` (exposed; the row-2 button's own copy) |
| `terminal-insert-path` | `pickFileInto` (the path menu's item) |
| `terminal-reveal` | `revealDir` from `useHeaderAction` (what an `open.reveal` button calls) |
| `terminal-voice` | `Terminal.toggleVoice` (exposed; declines where the mic is not capable) |
| `terminal-diff` | `openDiff`, only where the diff chip shows (a worktree with changes) |
| `terminal-note` | `startMemoEdit`, only with a session |

`TerminalCell` answers them from one `SELF_ACTIONS` table; each returns false when it cannot act, so
a header button shows a hint.
