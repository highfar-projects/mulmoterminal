# fix: the files-* keys and the palette's / # on the full-screen Files view (#2655)

`files-find` / `files-search` / `files-tab-*` and the palette's `/` `#` reached only the Files pane
beside an enlarged grid cell (GridView → TerminalGrid.runFilesAction). On the full-screen Files view
the grid does not have the keyboard, so they did nothing.

## Change

- `filesScreenHost` (new): FilesOverlay registers a host while mounted; `runOnFilesScreen(action)`
  runs on it only while the view is open.
- Keys: `usePaletteKeyAnywhere` takes a bound `files-*` key off the grid when the view is open —
  inside its editor too, as the grid's keys pass a contenteditable through beside a grid cell.
- Palette: the Files action rows and the `/` `#` handoffs are enabled while the view is open
  (`PaletteState.filesScreen`), and run on it before falling back to the grid.
- `files-insert-selection` is left out: it inserts at a terminal's prompt, and the view has none.
