# fix: the roster row menu's hovered item is unreadable in the light themes (#2437)

## Problem

`CockpitRowMenu`'s items were `text-fg enabled:hover:bg-[#29344a]`: the text follows the theme,
the hover background was a fixed dark-theme colour. In Daylight and Solarized Light the hovered
item's dark text sat on that dark background — measured contrast 1.26 and 1.28.

## Change

- `enabled:hover:bg-[#29344a]` → `enabled:hover:bg-hover`, the token the other menus
  (`anchoredMenuClasses.ts`) already use.
- `test/scripts/themeColorMix.ts` + `theme-color-mix.spec.ts`: across every `.vue` / `.ts` under
  `src`, no class string puts a fixed background (`bg-[#…]`, any variant) under the theme's text
  colour without a fixed text colour of its own. The rule is pinned both ways.

## The sweep

The same scan found only this site. All-fixed pairs (the command summary panel, the notification
badge) read the same in every theme. A contrast audit of the main screens in both light themes
found text under 3:1 only in `text-dim`, which is the theme token's own value — a different
problem, left out of this change.

## Verification

Playwright, row menu open, item hovered: Daylight 12.84, Solarized Light 7.10, Midnight 8.84.
