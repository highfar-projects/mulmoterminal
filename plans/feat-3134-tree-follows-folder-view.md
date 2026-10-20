# feat: the tree follows the folder view (#3134)

Follow-up to #3120 / #3131.

## What changes

- A move made in the folder view on the right (a folder row, or Up one folder) expands that
  folder's ancestors and the folder itself in the tree, outermost first, and scrolls its row into
  view. Going back to the root leaves the tree as it is (the root has no row).
- Nothing is collapsed: going up leaves the subfolder open.
- A tree click is unchanged; it already expands / collapses the folder it shows, so routing it
  through the same path would undo a collapse.

## Shape

- `useFilesReveal.ts` gains `showFolderInTree(dirRel)`, sharing `showInTree`'s generation, so a later
  move (or the front tab changing) takes over from one still expanding.
- `FilesPane.vue` sends the folder view's `show` through `showFromFolderView`, which shows the folder
  and puts the tree on it.

## Out of scope

- A back / forward button over the folders visited: discussed and held back.

## Tests

- `useFilesReveal.spec.ts`: order of expansion, the scroll, the root, a later move winning.
- `filesPaneFolderView.spec.ts`: walking down two folders in the view opens the tree; going up keeps it.
