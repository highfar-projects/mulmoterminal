# refactor: the Files pane remembers tabs, still opening one (#2267, step 1 of 3)

#2267 lets the Files pane open several files as tabs. It is split in three:

1. **This step** — the remembered state takes the shape of tabs. Nothing on screen changes and the
   pane still opens one file at a time; what is written, stored and read back is a list of tabs
   with one of them in front.
2. The tabs themselves: a tab strip, "add a tab or go to the one already open" from every entrance,
   saving every dirty tab on the way out.
3. Keys for closing / next / previous, through the prefix keys and the command palette.

The strip in step 2 follows the tab look the app already has (the collection chat strip), so the
UI stays one style rather than two.

## Change

- `filesPaneState.ts`: `FilesTabState` — one file's remembered facts (its path, whether it was
  read in Preview, the caret, the top line, the preview's scroll). `FilesPaneState` holds
  `tabs: FilesTabState[]` and `activePath` (the path of the tab in front — an identity, not a
  position), plus the pane-wide `expanded` and `treeScrollTop`. `activeTab(state)` reads the front
  tab.
- `useOpenFile.ts`: what a load is handed to put back is a `FilesTabState` (the file's own
  facts), not the whole pane. `FilePlace` is a `Pick` of the tab.
- `filesPreviewMode.ts`: `restoresPreview` decides from the tab.
- `FilesPane.vue`: `snapshot()` writes the open file as the one tab; `restore()` opens the front
  tab.
- `filesPaneStore.ts`: reads both shapes — the one written before this (`openPath` and the file's
  fields at the top) becomes one tab — and writes the new one. Each tab is capped the way the old
  fields were.

## The one thing that is written differently

With no file open, the old snapshot still wrote the editor's caret, top line, mode and preview
offset beside `openPath: null`. Nothing ever read them back — a restore only puts a place back into
a file it opens. They belong to a tab now, so with no file open there is no tab and nothing of the
kind is written. What a restore puts back is unchanged.

An empty `openPath` was never opened by a restore either; it now reads as no tab.

## Why a tab carries only a path

Every file the pane opens today is under the pane's own root (`tryOpenInPane` sends anything
outside it to a browser tab). When step 2 or later lets a file outside the root become a tab, it
adds an optional `root` to the tab — absent means the pane's root — so what is stored now needs no
second conversion.

## Verification

Behaviour must not change: the old and new code run side by side over generated stored states in
the old shape, and over live snapshots round-tripped through the store, comparing what a restore
would put back. The generated entries carry only the keys the old writer wrote; an old-shape entry
with an extra `tabs` key is pinned by its own spec (the old reader ignored it, and so does this
one) — the file, whether Preview comes back, the caret, the top line, the preview
scroll, the expanded directories, the tree scroll. The count and the mutations that proved the
harness can see a difference go in the PR.
