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
  `GET /api/files/browse/trash` (`{ available }`). The base is `namedBase`, not the read routes'
  `resolveBase`: a named cwd that is no longer a directory is refused (404) rather than replaced by
  the default workspace, where a same-named entry would be renamed or trashed. No `~` expansion in
  tree paths. The Trash is injectable so specs never touch the real one; the free-name search is
  bounded and keeps names within 255 bytes with their `.trashinfo`.

## Client
- `filesRowActions`: New file… / New folder… / Rename… / Move to Trash (only when the server has a
  Trash) at the end of every row's menu. English labels, as the menu's other entries.
- `useTreeFileOps`: asks the name (`window.prompt`) or confirms (`window.confirm`), calls the route,
  reads the parent folder again (`useFilesTree.refresh`), and keeps the tabs on what moved
  (`renamedIn` / `withoutEntry` in `filesTabs.ts`). When the front file is on the moving entry it is
  put down first (`file.close`, which saves) and reopened afterwards; a save that cannot land stops
  the operation.
- Strings for the prompts in five locales, in `src/i18n/filesTree/` (the locale files are at their
  line cap).
- After an operation the keyboard goes to the row it leaves (else the row the menu was opened on,
  else the first row), the git marks are read again, and nothing is applied if the pane moved to
  another folder while it was running.
