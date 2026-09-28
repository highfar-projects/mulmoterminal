# feat: remove the cell header + (#2353)

Decision 5 of the menu / icon cleanup in #2311.

## Change

- `CellChromeButtons.vue` drops the `+` button ("Start a terminal in this directory"), and the
  `new-here` event goes with it from every link of the chain: `cellChromeBinding.ts`,
  `gridCell.ts`, `CellShell.vue`, `TerminalGrid.vue`, and `GridView.vue`'s `@new-here`.
- `GridView`'s `toggleLaunchPanel` and the `terminal-new-here` shortcut are unchanged — the shortcut
  still opens the launch panel on the current terminal's directory.
- Guides (en/ja basics, config keymap table) stop naming the cell `+`.

## Out of scope

- The toolbar `+` and the path menu's *New terminal here* stay as they are.
