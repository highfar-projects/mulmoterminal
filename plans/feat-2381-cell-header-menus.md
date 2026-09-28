# feat: History and Tools menus on the cell header (#2381)

Part of the cell-header cleanup agreed in #2311 (history-like and tool-like buttons grouped;
expand / close / copy and the note stay where they are).

## Changes

- `CellPaneMenu.vue` — one header icon opening a menu of views (icon + name + one line), built on
  `useAnchoredMenu` like the toolbar's feature menu. Pane entries are `menuitemcheckbox`, checked
  while their pane is open (choosing again hides it); the trigger reads as pressed then.
- `cellPaneMenuEntries.ts` — what each menu lists, as pure functions:
  - **History**: Prompts you sent, Conversation, and the Activity timeline (Claude sessions).
  - **Tools**: Tools used, Canvas (disabled with the fix when there is no render MCP), Collections
    (only where the directory has the collection tools, or while its pane is open — its only close).
  - On a tile, panes are listed disabled ("Enlarge the cell to open this beside it"); the timeline,
    an overlay, stays pickable. A menu with nothing to pick is not shown.
- `CellChromeButtons.vue` replaces the five pane buttons with the two menus and maps a pick to the
  same event the old button raised; `open-timeline` is new and bound by `TerminalCell`, whose row-2
  timeline button is removed.
- i18n `cellMenu.*` in five locales; docs en/ja (basics, header, features) and README.

## Decisions (with the maintainer)

- Grouping: history = prompts / conversation / timeline; tools = tools used / canvas / collections.
- On a tile the history menu shows, with only the timeline pickable.
- Set aside, talk to another terminal, Skill and Mulmo unchanged.
