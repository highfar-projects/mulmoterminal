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
- **Restore is `reset(paths)`.** A re-root resets to none; putting a remembered pane back resets to
  its own paths. One function, because both mean "start over with these".
