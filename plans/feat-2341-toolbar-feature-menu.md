# feat: toolbar feature menu (#2341)

From #2311: Rooms, Blueprints and Worklog do not need a permanent place on the grid toolbar, and
their glyph-only icons (`forum`, `architecture`, `history_edu`) are hard to tell apart.

## Decision

- One menu button (`widgets`, "More features") on the grid route replaces the three buttons.
- Items in order: Rooms, Blueprints, Worklog — icon, name, one-line description (i18n, five locales).
- Gating unchanged: Rooms only once a room exists, Worklog only once it is enabled, Blueprints
  always — so the trigger is always present on the grid route and the menu is never empty.
- Pull requests stays its own button.

## Shape

- `useAnchoredMenu` (composable): the open / place / keyboard / scroll-close behaviour SortModeMenu
  had inline, now shared by SortModeMenu and FeatureMenu. The only difference between the two is
  the item selector and which item takes focus on open (checked radio vs. first command).
- `anchoredMenuClasses.ts`: the panel and row utility strings both menus use.
- `featureMenuEntries.ts`: pure — gated flags in, ordered entries out.
- `FeatureMenu.vue` emits the chosen entry; `AppToolbar` maps it to the same actions the old
  buttons ran (`roomsViewOpen`, `blueprintsViewOpen`, `wikiGotoTag("worklog")`).
- The old buttons' active states are dropped: each opens a different route, where the grid group
  (and so the button) was already hidden, so they could never show.
- `blueprints.toolbar` i18n key removed (its only reader was the old button).
