# feat: local history — list, compare and restore a file's kept versions (#2574)

## Problem

The pane already keeps versions of a file in `~/.mulmoterminal/backups` (on open, before an
overwrite, and a buffer a conflict reload discards — the newest few). Nothing read them back, so a
file an agent rewrote could not be taken back from here even though the version was on disk.

## Change

- `server/files/backup-store.ts`: `listBackups` (newest first, from the names the store writes) and
  `readBackup`, which reads only an id the listing gives back — `id` is compared, never joined into a
  path, so it cannot reach another file's backups or leave the store.
- Routes `GET /api/files/browse/backups` and `GET /api/files/browse/backup?…&id=`, contained like
  every browse route. Wire shape in `common/fileBackups.ts`.
- `useFileHeadText` can mark against a backup instead of HEAD (`compareWith` / `stopComparing`);
  HEAD refreshes wait while a backup is compared; opening another file ends it.
- `useFileHistory` lists, compares (marks against the version, removed lines shown) and restores —
  as an edit (`CmEditor.replaceDoc`): undoable, marks the buffer unsaved, and saving keeps the
  current text as a version too.
- UI: `FilesHistoryMenu.vue` (History button + list) and `FilesComparingBanner.vue`. Strings in all
  five locales.

## Not in scope

More generations, or keeping versions of files an agent writes without the pane having opened them.
