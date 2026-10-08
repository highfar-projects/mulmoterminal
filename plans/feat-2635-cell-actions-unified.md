# feat: one list of cell actions for header buttons, shortcuts and the palette (#2635)

A header button (`run: "action"`) and a shortcut (`keymap`) named the same operation differently
(`new-here` / `terminal-new-here`), and each had operations the other did not. The command palette
lists every keymap action, so a shortcut is also a palette command.

## Names

One list, `CELL_ACTIONS` in `common/headerActions.ts`, every entry a `KeymapAction`:

- existing keymap actions that act on one terminal: `zoom-toggle`, `mark-unread`,
  `terminal-new-here`, `terminal-new-adjacent`, `terminal-close`, `terminal-restart`,
  `terminal-move-prev`, `terminal-move-next`
- new keymap actions: `pane-files`, `pane-prompts`, `pane-transcript`, `pane-tools`,
  `pane-canvas`, `pane-collections`, `terminal-timeline`, `terminal-talk`, `terminal-park`

A header `action` accepts exactly that list. #2611's names (`new-here`, `files`, …) were never
released (merged after 7.1.0), so they are replaced, not aliased. `restart` shipped before and is
still accepted; the loader rewrites it to `terminal-restart`.

## Dispatch

- `TerminalGrid.runCellAction(action, uid)` is the one place a cell action is decided for a named
  cell: panes → `pressPane`; restart / timeline / talk / park → the cell's own handler
  (`useCellAction`, TerminalCell); expand / move → the grid events that already exist; the rest
  (new-here, new-adjacent, close, mark-unread) → `cell-shortcut` to GridView's `runCellShortcut`,
  which the keyboard already uses.
- A header button reaches it through `useGridCellAction` (TerminalGrid registers a runner, the
  button's `cell-<uid>` slot key names the cell). Outside the grid there is no runner, and the
  button says so.
- A shortcut for a new action goes GridView → `gridRef.runCellAction` on the enlarged cell, or the
  cursor's cell when nothing is enlarged (a pane enlarges it, as the pane button does).

## Out of scope

- Toolbar operations (screens, order, view, sound): a separate PR.
