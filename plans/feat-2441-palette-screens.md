# feat: command palette — go to any screen, from any screen (#2441)

Step 1 of #2411.

## Decisions

- **Screen rows.** A palette row is now one of two kinds: an action row (the grid runs it) or a screen row.
  - The screens, in the toolbar's order: Terminals, Collections, Feeds, Accounting, Files, Wiki, then PRs & Issues, Rooms, Blueprints, Worklog.
  - PRs & Issues, Rooms and Worklog appear only when set up, through the toolbar's own gating (now `useGatedEntries`, shared by both).
  - A screen row is never disabled. It opens through the same function the toolbar's button calls (`SCREEN_OPENERS`).
- **Names and icons.** Each screen's name comes from the i18n key its own door already uses (`SCREEN_LABEL_KEYS`), so the two cannot drift apart. Its icon is the door's icon.
- **One ranking.** Actions and screens are ranked in one `rankPaths` call.
  - Unfiltered, actions come first while the grid is in front, and screens come first anywhere else.
- **The key on every screen.** `command-palette` opens the palette on every screen, through a capture-phase listener in the toolbar.
  - On the grid, `useGridKeys` still answers it, so the listener does nothing there.
  - It only answers single-key bindings: a two-key sequence's wait lives in the grid.
  - A key typed into a field is left alone, by the grid's own rule (`keyYieldsToPage`).
