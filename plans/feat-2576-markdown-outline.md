# feat: Markdown outline in the Files pane (#2576)

## Change

- `src/components/markdownOutline.ts` (pure): the headings the Preview draws, in order — ATX and
  one-line setext, never inside a code fence, not in the YAML front matter; inline markup stripped for
  display. `currentHeadingIndex`: the heading at or above a line.
- `useFileOutline`: reads the buffer's headings when the menu opens, marks the one above the editor's
  top line, and goes to a heading — `revealLine` in Edit, a message to the Preview document in Preview.
- The Preview document's reporter (moved, unchanged, to `server/files/mdPreviewReporter.ts` so it has
  no Node dependency) takes a new host message `{ heading, headingText }`: the n-th heading it drew,
  or — when that one's text differs — the first with that text; it becomes the place (so an image
  loading above keeps it on screen) and is reported back as a scroll.
- `FilesOutlineMenu.vue` (own open state via `useDropdownMenu`); strings in five locales; guides.

## Not in scope

Marking the current heading while in Preview (its scroll position is in pixels of a document the pane
cannot read); headings inside blockquotes or lists, and multi-line setext paragraphs.
