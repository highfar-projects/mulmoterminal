# feat: the editor marks what changed since HEAD (#2497)

The Files pane's editor marks each line that is new (green) or changed (amber), and a notch where
lines were removed, as VS Code's gutter does; **Changes** in the header also shows the removed lines
in place, as a unified diff. Chosen with the user: marks always, the unified view on a toggle.
`@codemirror/merge` added (user-approved).

## Shape

- `GET /api/files/browse/head?cwd=&path=` — `git show HEAD:./<name>` from the file's folder, the text
  route's containment, the runner's byte budget at the editor's own cap; null outside git, for an
  untracked or added file, or past the cap.
- `cmChangeMarks.ts` (pure) — marks from @codemirror/merge's chunks. A chunk spans whole lines around
  a change, so the lines both sides share at its edges are trimmed first (an appended line is
  "added", not "the line before it changed"); a deletion marks the line after the gap.
- `cmChangeGutter.ts` — the gutter: chunks in a StateField updated with `Chunk.updateB` as the reader
  types. The unified view is `unifiedMergeView` in the same compartment.
- `cmEditor.ts` — `setOriginal` / `setShowChanges`. The original lives outside the state because
  loading a file replaces the whole state, and a re-read of the same file must keep its marks.
- `useFileHeadText.ts` — clears the original synchronously when the path changes (the new text goes
  in in the same breath), reads HEAD again on a path or version change and whenever git's status
  moves (an agent's commit moves HEAD without touching the file); a stale answer is dropped.
