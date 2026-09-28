# feat: the grid-ordering button opens a menu instead of cycling (#2330)

From #2311 ("state is shown only by an icon"): the ordering button cycled auto → manual →
priority, so the choices and what the next press would do were invisible.

## Shape

- `SortModeMenu.vue`: the button keeps today's icon for the current mode (`sort` / `swap_horiz` /
  `format_list_numbered`) and opens a menu of all three — icon, short name, one-line description,
  the current one checked (`menuitemradio`). Choosing emits `select`.
- `AppToolbar` emits `set-sort` with the mode; `GridView` sets it directly. The cycle
  (`nextSortMode`) is gone.
- `sortModeButton.ts` holds the mode list and icons; the words are i18n (`sortMenu`, all locales).
- The menu is teleported to `<body>` and fixed-positioned: the button sits in the toolbar's
  horizontally scrolling nav, which would clip it. `@pointerdown.stop` on the menu lets
  `useDropdownMenu`'s outside-press close treat it as inside.
