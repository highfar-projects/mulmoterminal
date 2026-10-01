# Toolbar: group the right-side icons, make Update an icon (#2799)

## Order

```
[Update] [star]  ·  [bell] [remote]  |  [view toggle] [sound]  |  [command palette] [settings]
```

- Transient asks first (Update, star), so one appearing or leaving never moves a permanent icon.
- Status next (notifications, remote host).
- The zoomed-grid view toggle sits left of sound, so it too can come and go without moving the
  two right-end buttons.
- Command palette and Settings stay fixed at the right end on every screen.

`ml-auto` moves from the bell to the first right-side element (the Update wrapper when shown).

## Update button

- Icon-only, 30px like `LauncherButton`: `upgrade` glyph in the accent colour plus a small accent
  dot in the corner, so it still reads as "something new" next to the grey permanent icons.
- `data-tip` stays the server's notice text (it carries the versions); `aria-label` uses
  `tips.toolbar.updateAvailable`.
- Popover copy (title, "Run this to update:", Copy / Copied) moves into `tips.toolbar` in all
  five locales.
