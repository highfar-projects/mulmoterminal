# feat: the Files pane opens several files as tabs (#2267, step 2 of 3)

Step 1 (#2451) made the remembered state a list of tabs with one in front. This step puts the tabs
on screen. Step 3 adds the prefix keys and command-palette entries.

## Decided with the user

- A plain click in the tree **replaces the front tab**, as it replaces the open file today. A new
  tab comes from **Cmd/Ctrl+click** on a row or the row menu's **Open in a new tab** — the
  browser's convention for links. Someone who never asks for a tab sees exactly today's pane:
  one file, no strip, and tabs never pile up from browsing.
- The strip appears only with **two or more** tabs. With one, the header names the file as now.
- The strip looks like the collection chat strip (`CollectionChatPane.vue`): a row under the
  header, small tabs, the front one in the selected colour, arrows / Home / End moving between
  them. The key handling is shared rather than copied.

## Rules

- **Opening a path that already has a tab goes to that tab** — from every entrance (tree, finder,
  search, a path clicked in terminal output, the host's `openFile`). Never two tabs for one file.
- **Switching tabs saves the one being left**, exactly as opening another file does today
  (`flush`). So only the front tab can hold unsaved edits, and there is one editor, not one per
  tab. If the save and the backup both fail, the switch does not happen — the same rule.
- Each tab keeps its own place (Preview or editor, caret, top line, preview scroll): it is
  recorded when the tab is left and put back when it is returned to.
- **Closing** a tab: × on the tab, middle-click, or Delete while the tab has focus. Closing the
  front tab moves to its right neighbour (left if it was last), saving first; closing the last
  tab leaves the pane empty ("Select a file"), saving first.
- The tab strip only changes after the file actually arrived: a read that failed, or a save that
  could not be made, leaves the tabs as they were.
- On restore, if the front tab's file is gone, that tab is dropped (the old pane skipped a deleted
  file the same way); the others stay.
- At the cap (`MAX_TABS`, the store's limit), a new-tab request replaces the front tab instead.

## Shape

- `src/components/filesTabs.ts` — pure: `withTab`, `openedInFront`, `openedInNewTab`, `closed`,
  `neighbourOf`. Unit-tested in both directions.
- `src/composables/useFilesTabs.ts` — the strip's state and the three actions (open, open in a new
  tab, close), built on `useOpenFile`.
- `src/components/tabKeys.ts` — `nextTabIndex`, lifted out of `CollectionChatPane.vue` so both
  strips answer the keys the same way.
- `useOpenFile.close()` — leave the open file with nothing in its place (flush first).
- `filesRowActions` — `open-tab` for a file row.
- Tooltips and aria labels in `tips.panes` for all five locales; visible words stay English like
  the rest of the pane.
