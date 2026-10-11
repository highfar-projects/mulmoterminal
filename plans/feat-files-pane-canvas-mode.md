# feat: Canvas as a view mode inside the Files pane (#3008)

## Problem

The Files pane's Canvas button (and the row menu's "Open in the Canvas") swaps the right pane from
Files to Canvas. Closing the Canvas closes the right pane, so the tree is gone and the user starts
again from "Browse files in the app". Users want the tree to stay while they move between the
editor and the Canvas view of the same file.

## Decisions

- **One file, in place.** The Canvas mode draws the open file's card only, with the same plugin
  view the Canvas uses (`getPlugin(toolName).viewComponent` inside `PluginFrame`). The tree stays.
- **Nothing is written to the session's Canvas.** The card comes from `buildCanvasCard` and lives in
  memory; `seedCanvasCard` is not called. Every view writes edits to the file itself, so the file is
  the only source of truth and an `update-result` only updates the local copy.
- **Right pane only.** Gated on `canvasTarget`, as the button is today. The full-screen `/files`
  view keeps the preview — see `docs/file-surfaces.md` for why that is a containment decision.
- **The buffer is saved first, in place** (`savedInPlace`, as Preview does): a view reads the file
  from disk, so an unsaved edit would otherwise be missing from what it draws. Not `flush`, which
  is for leaving a file and banks the buffer on a lost race; here the pane stays, so a conflict keeps
  its banner and the switch does not happen.
- **Per path, not persisted.** Which open files are in Canvas mode is held while the pane is up.
  Remembering it across a reload is out of scope.
- **The swap is removed.** The `open-in-canvas` emit and `TerminalGrid.openFileInCanvas` go; the
  session Canvas still opens from the agent's drawings and the cell's own Canvas button.

## Shape

- `src/components/FilesCanvasView.vue` — one card in a `PluginFrame`, measured with
  `useCanvasCardHeight` so a fixed-height view fills the pane.
- `src/composables/useFilesCanvasMode.ts` — which paths are in Canvas mode, building the card for the
  front one (with a generation guard for a tab switch mid-build), refusal text to the pane's error.
- `FilesPane.vue` — the header's Canvas button becomes a toggle (`aria-pressed`); while it is on, the
  editor-only controls (Edit/Preview, Changes, history, outline, @) are hidden and the section shows
  the card. The row action opens the file in a tab and turns Canvas mode on for it.
