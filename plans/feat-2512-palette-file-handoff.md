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

- `filesPanelSeed.ts`: a module-level seed per panel, taken once by `FileFinder` (as its first
  query) and `FileSearch` (on mount, so its watch runs the search). The palette seeds, then runs
  the action through the palette host exactly as the action row would.
- No change to GridView / TerminalGrid: the action's existing path opens the pane and the panel.
- `paletteScope.ts`: `/` → `file`, `#` → `content`. `commandPaletteRows.ts`: under those scopes
  the rows are the single hand-off row.

## Not here

Listing files inside the palette itself; PRs / Issues and prompt history.
