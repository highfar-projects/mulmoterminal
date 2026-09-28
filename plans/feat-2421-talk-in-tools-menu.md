# feat: talk to another terminal from the Tools menu (#2421)

Part of #2311.

## Decision

- The `forum` button on the cell's second row is removed. **Talk to another terminal…** becomes a
  row in the cell's Tools menu, below the divider with Restart. It is an action, so it can be
  picked from a tile as well.
- The row is shown only when there is another terminal to talk to. The list of other terminals is
  a snapshot (`listSlots` is not reactive), so the Tools menu emits `opening` and the cell reads the
  list again before the menu draws.
- Picking the row opens the same panel as before. The panel, the running exchange's stop and the
  status line hang from a zero-width anchor at the right end of the first row, under the Tools
  menu. `-ml-1` on the anchor cancels the row's `gap-1`.
- The tooltip strings `tips.cell.talk` / `talkAria` go; the row's text is
  `cellMenu.items.talk`.
