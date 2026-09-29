# feat: command palette — `/` and `#` hand off to the Files finder and search (#2512)

Part of #2411, step 6 (content jump), second part. The #2411 plan says file names and file contents
"hand over to the file search that exists", and lists `/` (files) and `#` (contents) among the
prefix symbols.

## What

- `/text`: one row, "Find files named “text”", which opens the Files pane's find-by-name panel with
  `text` already typed.
- `#text`: one row, "Search files for “text”", which opens the Files pane's search-in-files panel
  with `text` already typed, and searching.
- A bare symbol opens the panel empty. `?` lists both symbols.
- The row is disabled for the same reason the `files-find` / `files-search` actions are (the grid
  hidden; no enlarged terminal).

## Shape

- `filesPanelSeed.ts` is only a relay from the palette to the grid's action: the palette seeds,
  runs the action through the palette host exactly as the action row would, then drops whatever is
  left. `TerminalGrid.runFilesAction` takes the text before its first await, so a refused action
  leaves nothing behind for a later open.
- The text travels as an argument: `openFilesFinder(query)` → `FilesPane.openFinder(query)` → the
  panel's `seed` prop. A new seed object per open, so an already-open panel takes new text; the
  pane's own toolbar buttons open with an empty seed, so a plain open starts empty.
- `paletteScope.ts`: `/` → `file`, `#` → `content`. `commandPaletteRows.ts`: under those scopes
  the rows are the single hand-off row. A leading `/` always means file names; a terminal outside
  home is found by its absolute path after `@`.

## Not here

Listing files inside the palette itself; PRs / Issues and prompt history.
