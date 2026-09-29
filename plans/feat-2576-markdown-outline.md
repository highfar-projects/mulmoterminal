# feat: Markdown outline in the Files pane (#2576)

## Change

- `src/components/markdownOutline.ts` (pure): the headings the Preview draws, in order — ATX and
  one-line setext (a line that does not continue a paragraph, list item or quote), never inside a code
  fence or an HTML comment, and not in the front matter the Preview drops (decided by the same
  `splitFrontmatter` the server renders with). Display text keeps code spans and intraword `_`, decodes
  entities and escapes. `currentHeadingIndex`: the heading at or above a line.
- `useFileOutline`: reads the buffer's headings when the menu opens, marks the one at the editor's top
  line, and goes to a heading — in Edit, the caret there and the line at the top (so the mark then
  names it); in Preview, a message to the document.
- The Preview document's reporter (moved to `server/files/mdPreviewReporter.ts`, and extended) takes
  `{ heading, headingText, headingOccurrence }`: the n-th heading it drew, or — when that one's text
  differs — the occurrence-th heading with that text. The heading becomes the anchor the place follows
  while images load above it, until the reader scrolls; the host hears each new place.
- `FilesOutlineMenu.vue` (icon button, own open state via `useDropdownMenu`, rebuilt when the file or the
  mode changes); strings in five locales; guides.

## Not in scope

The current-heading mark in Preview (its scroll position is in pixels of a document the pane cannot
read); headings inside blockquotes or lists, and multi-line setext paragraphs (the Preview jump falls
back to the text for them).
