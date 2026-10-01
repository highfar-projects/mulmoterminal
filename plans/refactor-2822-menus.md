# refactor: one frame for the anchored menus (#2822, menus cluster)

## What is extracted

Seven menus — `CellPaneMenu`, `HeaderButtonFolder`, `FeatureMenu`, `SortModeMenu`, `MulmoMenu`,
`RunMenu`, `SkillMenu` — each wired `useAnchoredMenu` to a trigger `<span>` and a teleported
`role="menu"` panel by hand. That frame is now `src/components/AnchoredMenu.vue`:

- a `trigger` slot (given `open` and `toggle`) inside the same `inline-flex flex-none` span the
  composable anchors to, and a default slot for the items inside the same teleported panel
  (`pointerdown.stop`, `onMenuKeydown`, fixed position);
- props for what differed: `itemSelector`, `panelClass`, `testid`, an optional `label`
  (the panel's `aria-label`), and `initialFocus`;
- `open`, `toggle`, `close` and `leave` exposed for the callers that act on the menu from script
  (CellPaneMenu's `opening` emit, every `pick`, the cwd-change `close()` of the three list menus).

The trigger and item markup stay in each caller, so each menu keeps its own look and wording.

`initialItem` was a function per menu. A function prop is against the repo's Vue rules, so it
became a named mode — `first`, `checked`, `checkedOrFirst` — resolved by the pure
`initialMenuItem` in `src/components/anchoredMenuFocus.ts`.

## Why it preserves behaviour

- `initialMenuItem` was run beside the three original lambdas, copied verbatim, over generated
  item lists (random lengths, random `aria-checked` values including near misses) — every case
  identical. The generator and property live on in `test/src/components/anchoredMenuFocus.spec.ts`.
- The rendered DOM is the same span and the same panel. Two structural differences, both inert:
  the four menus whose `<Teleport>` sat beside the span now have it inside (the panel still lands
  in `<body>`; only the placeholder comments move), and the three list menus' state now lives in
  the child that unmounts with the button — which is what their `close()` comment was guarding
  against, so it is now true by construction rather than by the call.
- The existing component specs pass unchanged; `test/src/components/AnchoredMenu.spec.ts` covers
  the frame itself.

## Declined

Nothing in the cluster. The item rows of FeatureMenu / SortModeMenu / CellPaneMenu (icon, label,
detail) still look alike, but jscpd does not flag them and their attributes differ per menu.
