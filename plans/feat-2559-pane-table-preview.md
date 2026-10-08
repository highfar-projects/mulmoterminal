# feat: the Files pane previews a CSV / TSV as a table (#2559)

## Problem

The same `.csv` looked different depending on where it was opened: a path clicked with no cell
enlarged opened `/api/files/browse/table` in a new tab (a table), but in the Files pane it was only
ever text in CodeMirror.

## Change

- `FilePreviewKind` gains `"table"` for `.csv` / `.tsv` (`src/components/filePreviewKind.ts`), so the
  pane offers the same Preview / Edit toggle Markdown, HTML and SVG have.
- `previewSrcFor("table", …)` points at `/api/files/browse/table` with `v` (so a rewritten file is
  fetched again, as Markdown's is) and the app theme — but none of the Markdown wire's `embed` /
  token: the table document has no script to report with.
- The table document takes the theme (`tableHtmlDoc(…, theme)`): `themeStyle` plus the table's own
  surfaces (sticky header ground, stripes), appended after `TABLE_STYLE` so they win. The plain route
  passes `previewThemeFromQuery` to every `RenderDoc`; only the table uses it. With no theme on the URL
  (a new tab) the document is byte-for-byte the old one, and the CSP stays `sandbox`.
- The frame's ground follows the app theme for `markdown` and `table` (`previewFollowsAppTheme`);
  HTML / SVG keep white.
- A CSV opened from terminal output comes up in Preview, as HTML / SVG do — before the pane took the
  click, that path opened as a table.

## Not in scope

PDF / video / audio in the pane (decided against for now on #2269).
