# feat: command palette — a second panel of actions on a row (#2546)

Part of #2411, step 7 (二つ目の操作パネル), last part. Decided: opened with Tab; started small.

## What

Tab on a selected row replaces the list with that row's actions: Run (disabled with the row's own
reason), Add to / Remove from favorites (writes `paletteFavorites`, #2540), Copy its key. Arrows and
Enter pick; Esc or Shift+Tab goes back to the rows; typing closes the panel.

## Shape

- `paletteRowActions.ts` (pure): `rowActions(row, key, favorites)`, `isWritableKey` (the keys
  skill's table: not a terminal, a launcher start, a prompt, a hand-off or a symbol, whose keys are
  positional or never reach a favorite), `toggledFavorites`.
- `PaletteRowActions.vue`: draws the list; `CommandPalette.vue` owns the keys and state.
- Run re-finds its row by key, since rows that arrive late (a Wiki index, PRs) can move places.
- `useAppConfig.savePaletteFavorites`: POSTs the whole list, like the launchers; a failure is shown
  in the palette footer. settings-coverage now counts `paletteFavorites` as UI-writable.

## Not here

Per-kind actions (enlarge / close a terminal, copy a URL, …); setting an alias from the palette.
