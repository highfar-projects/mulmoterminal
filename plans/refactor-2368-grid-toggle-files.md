# refactor: drop the grid's toggle-files path (#2368)

Since #2364 removed the row-1 Files button, no cell raises `toggle-files`. The grid still handled
it (`toggleFiles` → `toggleRightPane("files", uid)`) and `GridCellEmits` still declared it; its only
readers were specs.

## Change

- `TerminalGrid.vue` loses `toggleFiles` and its `gridCellEvents` entry; `gridCell.ts` loses the
  event. `toggleRightPane` stays (tools / canvas / prompts / transcript / collections use it).
- Specs open the files pane the way the app does — `open-files` (the path menu's Browse files) —
  and close it with the pane's own `close`.
- The six specs that preset a TILED cell with files now use `open-files` on that tile. In the app
  that also saves the open pane's buffer (it may be re-rooted) and asks for the enlargement; the
  fixture's parent ignores the request and the helper clears the save, so each test starts from
  the same state it did before and counts only its own calls.
- Removed: "saves before the header toggle closes the pane" — there is no header toggle; the
  pane's own close is covered by "does not flush again when the pane itself reports it is closing".
