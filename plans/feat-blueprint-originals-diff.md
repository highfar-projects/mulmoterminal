# See what a build changed in a document, on the finished screen (#2792)

A finished polish build's report says what it changed, but the change itself — and the sentences around it — could
only be seen by opening the file elsewhere, and that shows the file now, not against its original.

- `common/blueprint/originals.ts`: the wire shape (`originalsViewSchema`), where originals live
  (`.blueprint/originals/`), a limit, and `originalPaths` (pure: order, once each, at most the limit, `more`).
- `server/blueprint/originals.ts`: `originalsOf(projectDir, reader)` pairs each original with the file now. The
  route (`GET /api/blueprints/runs/:id/originals`) passes the same reader every file a build reads back uses:
  the walk lists no link, and a read follows none and stays inside the project — so an original or a current file
  that is a link out of the folder is not read (tested for both).
- `src/components/cmDiffView.ts`: a read-only CodeMirror view with `unifiedMergeView` (the Files pane's change
  display), line wrapping, unchanged stretches folded to two lines of context; the fold's words come from i18n.
- `BlueprintOriginalsDiff.vue`, under the report on the finished screen: one diff per file still there, a note for
  one that is gone, nothing at all for a build that kept no originals.
- The guide's paragraph on the finished screen says so in both languages.

Real screen: a finished polish build shows blog.md with the removed opening, the rewritten closing (old and new in
place) and 「変わっていない 10 行」 folded between them.
