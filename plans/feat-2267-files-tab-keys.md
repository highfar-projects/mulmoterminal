# feat: keys and palette entries for the Files pane's tabs (#2267, step 3 of 3)

Step 2 (#2461) put the tabs on screen, reachable by mouse and by the keyboard inside the strip.
This step reaches them from anywhere the grid takes keys, and from the command palette.

## Actions

`files-tab-close`, `files-tab-next`, `files-tab-prev` join `KEYMAP_ACTIONS`. Like every action they
have **no default binding** — the user writes one in `keymap` (a two-key sequence works).

- They sit in `NEEDS_A_CURRENT_TERMINAL`, beside `files-find`: the pane lives only in the enlarged
  row, so a tiled grid declines the key and it reaches the terminal.
- Unlike `files-find` they **do not open the pane**. Closing or switching a tab in a pane that was
  not up has nothing to act on, so with the pane closed the key does nothing. `NEEDS_FILES_PANE`
  names them for the palette, which shows them disabled with "Needs the Files pane open".
- `files-tab-close` closes the front tab (saving first), including the last one, which leaves the
  pane empty — the one close the strip itself cannot offer, since it is hidden at one tab.
- `files-tab-next` / `-prev` go round at the ends; with no tab in front they start from the first /
  the last.

## Shape

- `filesPaneActions.ts` — the five actions the Files pane answers, so `GridView` hands them to
  `TerminalGrid.runFilesAction` through one branch (which also keeps `GridView.vue` under its line
  limit).
- `filesTabs.steppedPath`, `useFilesTabs.closeFront` / `step`, exposed by `FilesPane` as
  `closeFrontTab` / `stepTab`.
- The palette host gains `filesOpen()`.
- Labels and palette descriptions in all five locales; the keymap tables in both guides and the
  `mulmoterminal-keys` skill, with a note that VS Code's `Cmd+W` / `Ctrl+Tab` belong to the browser.
