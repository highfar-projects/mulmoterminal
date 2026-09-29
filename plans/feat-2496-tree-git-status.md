# feat: the Files tree shows what git sees (#2496)

In a git repository the tree marks changed files as VS Code's explorer does — a tint and a letter
(`M` modified, `A` added, `U` untracked, `R` renamed) — and a folder holding changes gets a dot, so a
collapsed tree still says where an agent has been writing.

## Shape

- `common/fileGitStatus.ts` — the wire shape (`{ repo, files: path → state }`), used by both ends.
- `server/git/statusEntries.ts` (pure) — `git status --porcelain=v1 -z` to that map: a rename's or
  copy's original path skipped (it can look like an entry), an untracked folder keyed by its own path,
  paths made relative to the pane's root (`rev-parse --show-prefix`) and anything outside dropped.
- `server/files/files-git-status.ts` — `GET /api/files/browse/git-status?cwd=`, the browse routes'
  base (names and states only, which the listing already reveals), coalesced per root because every
  pane on one checkout polls it and each `git status` scans the work tree.
- `src/components/filesGitDecorations.ts` (pure) — a row's own state (own keys only) and whether a
  folder holds a change below it.
- `src/composables/useFilesGitStatus.ts` — read when the tree loads or reloads, when the open file's
  version moves (a save, an outside change landing), and every `EXTERNAL_CHECK_MS` while the page is
  visible; dropped when the pane re-roots; a stale answer for the root being left is ignored.
