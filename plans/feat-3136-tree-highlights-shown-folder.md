# feat: the tree highlights the folder on show (#3136)

Follow-up to #3131 / #3135.

## What changes

- While the folder view is showing, the tree highlights that folder's row as it highlights the open
  file (`active`: the selected background, the accent edge, `aria-current`).
- One row at a time: an open file wins, since the folder view is hidden then. The root has no row, so
  nothing is highlighted while it is shown.

## Shape

- `FilesPane.vue`: `currentRowPath` = the open file, else the folder on show (while `folderShown`),
  and the tree row's `active` compares against it instead of `openPath`.

## Tests

- `filesPaneFolderView.spec.ts`: nothing marked at the root, the folder marked once shown, the file
  marked instead once one opens from the view.
