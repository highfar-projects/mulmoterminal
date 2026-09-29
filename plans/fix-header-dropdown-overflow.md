# fix: Run / Skill / Mulmo dropdowns cut off at the cell's right edge (#2524)

## Problem

The three list dropdowns in a session cell's second header row render their panel in place,
`absolute left-0` under the button. Near the cell's right edge the panel runs past it and the cell
clips it.

## Approach

Use the mechanism the same row already has for `HeaderButtonFolder`: `useAnchoredMenu`.

- The panel is teleported to `<body>`, positioned `fixed` under the trigger, and pulled back inside
  the viewport by `fitMenu`. No ancestor's `overflow` can clip it any more.
- Width is capped at the viewport (less a margin) and each row's label truncates, so a label longer
  than the window does not produce a horizontal scrollbar.
- The three panels shared one duplicated class string; it moves to `anchoredMenuClasses.ts`
  (`LIST_MENU_PANEL_CLASS` / `LIST_MENU_ITEM_CLASS`).

### Two changes to `useAnchoredMenu`

- **Scrolling inside the menu no longer closes it.** It closes on any scroll (capture phase) because
  a fixed menu drifts from its trigger when the page moves. These menus scroll their own list
  (`max-h-80`), which the capture listener also saw, so the list could not be scrolled. A scroll
  whose target is inside the menu is now ignored.
- **`close` is returned** alongside `leave`. The menus close themselves when the cell's cwd changes;
  that is not a user action, so it must not move focus to the trigger the way `leave` does.

## Tests

- Menu specs stub `Teleport` so their existing queries still find the panel.
- `SortModeMenu.spec.ts` pins that a scroll inside the menu leaves it open (checked red with the
  containment check removed).
