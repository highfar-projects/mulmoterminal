# feat: the editor beside the Canvas view (#3015)

## Behaviour

The side-by-side button already means "the editor on the left, the file rendered on the right"
(#2577). The Canvas button now chooses what the right half is: Preview, or the Canvas view (#3009).
Turning side by side off with the Canvas view on leaves the Canvas view alone. The Canvas view's
plugin watches its own file, so a save in the editor redraws it; there is no heading-follow.

## Shape

- `src/components/filesViewLayout.ts` — a pure `viewLayout({ showPreview, showCanvas, split })` →
  `{ editor, preview, canvas, sideBySide }`. Every "is the editor on screen" condition in
  `FilesPane.vue` (Changes, history, comparing banner, outline, @, focus, the insert-selection key)
  reads it instead of spelling `!showPreview && !showCanvas` again. `useSideBySide` returns it.
- In the Canvas view, Edit/Preview steps aside and only the side-by-side toggle is offered
  (`FilesViewModeButtons.canPreview`).

## Behaviour preservation

The old conditions were copied verbatim into a throwaway harness and run against the new ones over
all eight switch combinations. The only differences: the editor-beside-Canvas row (the change), and
`editorHidden` in Preview, whose consumer (`selectionReferenceText`) already ignores the selection
when `showPreview` is on, so the inserted text is identical. The table is pinned in
`filesViewLayout.spec.ts`.
