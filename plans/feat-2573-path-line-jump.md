# feat: a clicked `path:line[:col]` opens the file at that line (#2573)

## Problem

Agents, compilers and linters print `src/a.ts:42`, `src/a.ts:42:7` or tsc's `src/a.ts(12,5)`. Only the
path was a link, and the line was thrown away, so the file opened at the top.

## Change

- `src/composables/filePathLocation.ts` (pure): `locationAfterPath` reads `:line`, `:line:col`, `(line)`
  or `(line,col)` right after a path; at most seven digits, line >= 1, a column of 0 is dropped.
  `locationFromQuery` / `locationQuery` carry it through the Files view URL.
- `findFilePathLinks` reports the location beside the path and extends the link range over it; the
  link's `text` stays the path, which is what every route is handed.
- The location travels with the click: provider -> `tryOpenInPane` -> the grid's opener -> the pane's
  `openFile(pathRel, location)`, or `filesGotoFile(cwd, path, location)` -> `/files?...&line=&col=` ->
  `FilesPane`'s `requestedLocation`.
- `FilesPane.openAt`: opens the file in Edit (a tab in Preview switches, since the line lives in the
  text), then `revealLine(line, col - 1)` — the tools' column is 1-based, the editor's is an offset. A
  picture ignores the line. A rendered new tab (Markdown, JSON, table, HTML) ignores it too.

## Not in scope

Any other location shape (`file#L42`, `line 42 of file`).
