# feat: drag a roster row by its header (#2375)

Part of the menu / icon cleanup agreed in #2311.

## Change

- The roster row's separate drag handle (`drag_indicator`, `cockpit-drag`) is removed.
- In manual sort the row's header bar (`CockpitHeader`) is the drag source: `draggable`, a grab
  cursor, and the same `onRowDragStart` / `commitRosterDrag` the handle used. The drag image is
  still the whole row. In auto and priority sort the header is not draggable.
- A plain click on the header still switches the enlarged terminal: a press that turns into a drag
  fires no click, so the header can be both. The ⋮ row menu keeps its move up / down items as the
  keyboard route.
- The sort-order menu's Manual description says a roster row is dragged by its header, in all five
  locales; `rowMenu.dragToReorder` (the handle's tooltip) is removed as nothing reads it.
- en/ja basics guide updated.

## Out of scope

- The tiled grid keeps its `<` `>` move buttons (decided with the user: roster only).
