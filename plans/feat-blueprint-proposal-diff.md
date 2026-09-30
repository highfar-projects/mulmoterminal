# The finished screen also shows review's proposed copies (#2794)

#2793 compared each original a build kept under `.blueprint/originals/` with the file now. A review answered
「直し方の案まで作る」 keeps its originals untouched and writes `<name>.proposed<ext>` beside each document — made, as its
own skill says, to be compared line by line — and nothing on screen compared them.

- `proposedBase` (common, pure, no regex): `contract.proposed.txt` → `contract.txt`, `docs/a.proposed.md` → `docs/a.md`,
  `notes.proposed` → `notes`; null for anything that is not a proposed copy (tested both ways).
- `originalsOf(projectDir, reader, sinceMs)` adds, after the kept originals, each proposed copy written since the
  build started whose document is there, as `{ path: the copy, original: the document, current: the copy, from }`.
  The limit covers both together. The route passes the build's `createdAtMs`.
- The view titles such an entry 「contract.txt → contract.proposed.txt」, and its note says where kept originals are
  only when there are some, and what a proposed copy is only when there is one.

Real screen: the review example's finished build shows contract.txt → contract.proposed.txt with the edits to 第4条,
第6条 and 第8条 in place and the added 第5条.
