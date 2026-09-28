# feat: the roster row's ⋮ on filmstrip thumbnails (#2391)

Part of #2311.

- `thumbnailRowMenu.ts`: `rowMenuFor(row, moves, connected)` builds the menu from the grid's roster row
  (unread/read only while the cell is markable and its socket is connected), pure.
- `TerminalGrid` hands `rowMenu` only to cells shown as thumbnails (`zoomed && !listMode`, not the
  enlarged one) and routes a thumbnail's `attention` to `markAttention`; `move` and `park` already
  reached it.
- `CockpitRowMenu` takes `axis`; horizontal names the moves left / right (same -1 / +1 events).
- `TerminalCell`'s filmstrip header and `CellShell`'s thumbnail header render it before close;
  close runs the cell's own close (worktree confirm), park emits `park`, unread/read `attention`.
- i18n `rowMenu.moveLeft` / `moveRight` (five locales); basics en/ja.
