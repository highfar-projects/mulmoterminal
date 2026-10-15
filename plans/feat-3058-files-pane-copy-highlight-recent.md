# feat(files): copy button, the open file stands out in the tree, recent files (#3058)

Three Files-pane changes, one PR each. `FilesPane.vue` serves both the right pane and the
full-screen `/files` view, so each lands on both surfaces.

## 1. Copy the whole file

- The editor is CodeMirror: the line numbers (`basicSetup`'s `lineNumbers()`) and the text are two
  boxes side by side. A mouse drag that starts in the gutter copies the numbers, not the text
  (measured in Chromium: `"1\n2\n3\n4\n5\n⌄\n"`).
- A header button copies `CmEditor.getDoc()` — what the editor holds, unsaved edits included — and
  shows the existing "Copied!" toast (`PreviewCopiedNotice`) with the line count and first line.
- No button where the page has no Clipboard API (plain http on a LAN address).
- The `@` button and the copy button both act on the text in the editor, so they share one condition
  and live in `FilesEditorActions.vue` (`FilesPane.vue` was at its `max-lines` limit).
- The toast's timer is shared with the Preview code-block copy through `useCopiedNotice`.

## 2. The open file stands out in the tree

- The open row is already marked, but with `bg-hover` — the hover colour, so it reads as nothing.
  Use the tabs' `bg-selected`, a stripe at the left edge, and `aria-current`.
- The tree follows the front tab (#2495) only after the remembered state is restored, so a remembered
  scroll can leave the open row off screen. Bring it into view after the restore too.

## 3. Recent files

- Named **Recent files / 最近開いたファイル**, never "history": **History / 履歴** is #2574's
  earlier versions of ONE file. Its own icon (not `history`).
- Per directory, newest first, kept across reloads beside the remembered pane state; a header button
  lists them and opens the one picked.
