# feat: page-next / page-prev (#2654)

The grid's page tabs were mouse-only. `page-next` / `page-prev` join the app actions (#2639):
a keymap shortcut, a header `action`, and — unlike the other app actions, which the palette
already has rows for — a command-palette action row.

- `useGridPaging` takes GridView's page count and `switchTo` (moved verbatim, with its comment) and
  adds `stepPage(dir)`: one page, no wrap, false at either end. The move also keeps GridView under
  its `max-lines` cap.
- `paletteGridView` gains `stepPage`; `runAppAction` calls it.
- `LISTED_ELSEWHERE_IN_PALETTE` replaces "every app action" as what the palette leaves out.
