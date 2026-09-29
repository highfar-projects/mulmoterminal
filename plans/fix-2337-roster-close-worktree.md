# fix: the roster's ⋮ close and the keyboard close skip the worktree dialog (#2337)

Found while taking stock of the grid chrome for #2311.

## The defect

A worktree cell's own × runs `TerminalCell.close()`, which asks keep/remove. The roster row's ⋮
Close (`TerminalGrid` emitting `close`) and the `terminal-close` shortcut went straight to
`GridView.onClose`, so they dropped the cell without asking; the worktree stayed on disk.

## The fix

- `TerminalCell` exposes `close()`. For a worktree cell that is not the enlarged one while the grid
  is zoomed (parked off-screen behind the roster, or a thumbnail), it asks the grid to enlarge it
  first, because the dialog is drawn inside the cell.
- `TerminalGrid` keeps each session cell's `close` by uid and exposes `requestClose(uid)`: true
  when the cell closed itself, false for a cell without one (command / launcher cells), which are
  dropped as before. The roster's ⋮ Close and GridView's `terminal-close` both go through it.
- The roster drag handle's tip, hard-coded Japanese, is i18n (`rowMenu.dragToReorder`).
