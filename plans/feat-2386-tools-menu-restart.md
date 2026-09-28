# feat: Restart the agent in the Tools menu (#2386)

Part of the cell-header cleanup in #2311 (follow-up to #2382).

- `cellPaneMenuEntries.ts`: the Tools menu ends with **Restart the agent**, below a divider, when the
  cell has an agent session (`restartAvailable`). It is an action, not a pane, so it is pickable on a
  tile; the Tools menu now shows on a tile when that is its one choice.
- `CellChromeButtons` emits `restart-agent`; `TerminalCell` binds it to its existing `restart()` (the
  same path as the `run: "action"` header button and the `terminal-restart` shortcut) and passes
  `restartAvailable = launched && sessionId`, the condition its restart handler already uses.
- `CellPaneMenu` draws a divider before an entry marked `separated`.
- i18n `cellMenu.items.restart` (five locales); basics en/ja and README.

Decided with the maintainer: the Tools menu shows on a tile with only the restart pickable; the
user's own `restart` header button is removed from their config once this ships.
