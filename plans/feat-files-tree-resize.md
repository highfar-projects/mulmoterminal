# feat: resizable file tree in the file pane

## Problem

The file pane's tree had a fixed width (`clamp(160px, 24%, 340px)`), so long file names were
cut off with an ellipsis and there was no way to read them.

## Change

- A separator between the tree and the editor, driven by the shared `dragSplitter` (pointer
  capture, one drag at a time) and `splitterKeySize` (arrow keys, Home / End).
- The width is remembered under `files_tree_width` via `readStored` / `writeStored`.
- Floors: `FILE_EDITOR_TREE` in `splitterWidth.ts` — the editor is the side that survives, the
  tree can be squeezed. A `max-width` keeps the editor's floor when the window shrinks after a
  width was stored.
- A row whose name is cut off gets the name as a `data-tip`, set on the row's own `pointerover`
  so the shared tip listener sees it; a row that fits gets none.

## Not done

- No double-click to reset the width.
