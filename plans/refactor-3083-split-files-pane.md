# Split FilesPane.vue into smaller pieces (#3083)

## Problem

`FilesPane.vue` is at its `max-lines` cap, so every Files pane feature first has to move something
out, and the component is hard to read in one pass.

## Shape

No behaviour change. Each piece is a verbatim move of markup or script:

- `FilesTreeRow.vue`: one tree row with its clipped-name tip and git mark. The click, context-menu
  and key listeners stay on the pane and fall through to the row's button, so `currentTarget` is
  still the button the row menu anchors on.
- `FilesTreeSplitter.vue`: the tree's resize handle (listeners fall through the same way).
- `FilesTabStrip.vue`: the tab strip. Tab keys are emitted; the pane still decides where focus
  lands, asking the strip for its front tab through an exposed `focusFront()`.
- `FilesRowMenuPanel.vue`: the teleported row menu; exposes its element for `useFilesRowMenu`.
- `FilesUnpreviewable.vue`: the media view / "not text" block with its Open in OS button.
- `FilesChangesButton.vue`, `FilesSaveButton.vue`: header buttons that are plain markup.
- `useFilesPaneGit.ts`: git status, the HEAD text, Changes and the history menu, with their
  watches registered in the same order.
- `filesPaneRestore.ts`: putting a remembered tree and its tabs back at startup.

## Proof

- The old pane (a scratch copy, not committed) and the new one are mounted over the same states and
  their `html()` compared.
- The existing FilesPane suites run unchanged.
