# feat: the clicked folder in the empty file area (#3120)

Follow-up to #3079 (the right-click gallery).

## What changes

- While no file is open, the Files pane's file area shows a folder instead of "Select a file to view
  or edit." — the pane's root at first, then whichever folder was last clicked in the tree.
- A tree folder click still expands / collapses it, and also makes it the folder shown. While a file
  is open the right side does not change; the click is remembered, and closing the last tab shows it.
- Two views, switchable in the folder view's header, the choice kept per browser (localStorage):
  - **list** — each entry with an icon, its name and (for a file) its size; a folder row shows that
    folder, a file row opens it in a tab (Cmd/Ctrl+click: a new tab), as the tree does;
  - **gallery** — the existing gallery tiles (`FilesGallery.vue`), embedded rather than over the pane.
- **Include subfolders**: off by default and not remembered. On, folders down to two levels below
  are read too, breadth first, with a cap on how many are read. Dot-folders and `node_modules` are
  not descended into (they would spend the cap on nothing anyone browses for pictures). Each folder
  read is a group under its own heading, in path order, the shown folder's own entries first.
  The gallery's ← / → walk every item across the groups.
- The right-click "Open as gallery" overlay stays as it is.

## Shape

- `src/components/folderView.ts` — pure: which subfolders to read next (depth, cap, skipped names),
  the order of groups, a listing's rows (folders first, then by name), the gallery items of all
  groups, what a tree operation does to the folder on show, and parsing the remembered mode.
- `src/composables/useFolderView.ts` — the folder on show, the groups read for it, and loading them
  only while the view is visible (a click while a file is open costs nothing until it is seen).
- `src/components/FilesFolderView.vue` (header + mode / subfolder controls + body),
  `src/components/FilesFolderList.vue` (the list). `FilesGallery.vue` gains `closable` (embedded:
  no close button, Esc in the grid does nothing), a `controls` slot, and group headings.
- `FilesPane.vue` routes a tree folder click to the view and shows it in place of the empty message.

## Tests

- `folderView.ts` exhaustively (normal + abnormal inputs), `useFolderView` with a mocked fetch,
  the two components mounted, and the gallery's new props.
