# feat: command palette — jump to a Wiki page (#2503)

Part of #2411, step 6 (content jump), first part. Step 6 is split by kind: Wiki pages, files,
PRs / Issues, prompt history.

## What

"Wiki: <title>" for each page in the Wiki index, found by its title, slug, description and tags.
Picking one opens the page (`wikiGotoPage`), from any screen.

## Shape

- `paletteWikiPages.ts` (pure): an untitled page is named by its slug; keywords are the slug, the
  description and `#tag`s, with empty parts left out.
- `usePaletteWikiPages`: `fetchWikiIndex()` once per opening (the palette is mounted only while
  open); a failed read lists no pages.
- Rows: kind `wiki`, key `wiki:<slug>`, the page description (or a plain one) as the detail. Not in
  the `>` or `@` scope. Unfiltered, they follow the screens.

## Not here

The Wiki screen is not gated, so neither are its pages. Files, PRs / Issues and prompt history are
the next parts; the `/` and `#` prefixes are not added here.
