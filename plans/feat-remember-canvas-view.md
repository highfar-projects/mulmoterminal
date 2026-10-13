# feat: remember the Files pane's Canvas view (#3011)

## Problem

Which files were in the Canvas view (#3008) was held only while the pane was up. Closing and
reopening the pane, or reloading the page, put every file back on its editor.

## Decisions

- **Stored the way Preview is.** `FilesTabState.showCanvas?: boolean`, written by the pane's
  `snapshot()` (`withCanvasView` in `filesTabs.ts`, for every tab, so a tab switched back since a
  restore says so) and read back in `restore()`.
- **Whitelisted in `filesPaneStore.cappedTab`.** Anything but `true` reads as absent, so entries
  written before this read as the editor, as they did.
- **Fail closed on surface.** The store is per directory, and nothing ties a remembered state to the
  surface that wrote it. `useFilesCanvasMode` takes `enabled` (the pane passes `canvasTarget`) and
  `active` requires it, so a remembered Canvas view never draws on a surface with no Canvas view
  (`docs/file-surfaces.md`). The full-screen view does not read this store today; the gate holds if
  it ever does.
- **An open that beats the restore wins outright.** A pane opened FOR a file (a terminal click racing
  the restore, #1979) starts on that file as text, as it would with Preview, whose remembered mode is
  only read once the strip is back. Its path cannot be asked while it is still in flight, so when any
  open got in first, no remembered Canvas view is put back that time. The other tabs lose theirs for
  that one start; that is the cost of not guessing.
- **Restore is `reset(paths)`.** A re-root resets to none; putting a remembered pane back resets to
  its own paths. One function, because both mean "start over with these".
