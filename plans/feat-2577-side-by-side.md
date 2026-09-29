# feat: Markdown editor and Preview side by side (#2577)

Decided on the issue: side by side, synced by heading (not by line).

- `src/composables/useSideBySide.ts`: `on`; `active` while a previewable Markdown file is open and the
  pane is not showing the Preview alone. `toggle()` leaves the Preview for the editor first (the left
  side is the editor). A capture-phase `scroll` listener on the editor host (CodeMirror scrolls an
  inner element) debounces, reads the heading the editor's top line is under
  (`currentHeadingIndex`), and sends it to the Preview with `goToHeading` — the #2576 path, with the
  text and occurrence the Preview uses when its count differs. The same heading is not re-sent within
  its section. `editorClass` / `previewClass` put the editor first in equal halves.
- `headingOccurrence` moved into `markdownOutline.ts`, shared with `useFileOutline.pick`.
- `FilesViewModeButtons.vue`: the Edit/Preview button, moved out of `FilesPane.vue` (at its line cap),
  plus the side-by-side toggle for Markdown.
- `FilesPane.vue`: the Preview frame is shown while side by side as well; classes from the composable.
- One way only: the editor leads. The Preview is the saved file, so edits appear after a save.
