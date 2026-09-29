# feat: new, rename and Trash from the Files tree (#2578)

Decided on the issue: delete moves to the system Trash; where the Trash is not known, no delete.

## Server
- `server/files/tree-ops.ts`: `validEntryName` (one name: no separator, NUL, `.`/`..`, blank, over
  255 bytes); `entryUnder` (the entry the tree shows — lexically contained, parent contained through
  symlinks, never the root; a link is the link); `createEntry` (`wx` / `mkdir`, never over an
  existing name); `renameEntry` (in place; a case-only rename of the same inode allowed);
  `trashLayout` (macOS `~/.Trash`, Linux freedesktop `$XDG_DATA_HOME/Trash`, else null);
  `freeTrashName` (`a 2.txt`…); `trashInfo` / `moveToTrash` (freedesktop `.trashinfo` written first
  with `wx`; `rename`, so another volume is refused rather than copied and deleted).
- `server/files/files-tree-routes.ts`: `POST /api/files/browse/{create,rename,trash}` and
  `GET /api/files/browse/trash` (`{ available }`), on the browse base like every browse route.
  The Trash is injectable so specs never touch the real one.

## Client
- `filesRowActions`: New file… / New folder… / Rename… / Move to Trash (only when the server has a
  Trash) at the end of every row's menu. English labels, as the menu's other entries.
- `useTreeFileOps`: asks the name (`window.prompt`) or confirms (`window.confirm`), calls the route,
  reads the parent folder again (`useFilesTree.refresh`), and keeps the tabs on what moved
  (`renamedIn` / `withoutEntry` in `filesTabs.ts`). When the front file is on the moving entry it is
  put down first (`file.close`, which saves) and reopened afterwards; a save that cannot land stops
  the operation.
- Strings for the prompts in five locales; `fileHistory` moved with them to `src/i18n/filesTree/`
  (the locale files are at their line cap).
