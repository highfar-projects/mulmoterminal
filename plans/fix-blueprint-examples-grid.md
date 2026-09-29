# fix: tile the blueprint example cards (#2472)

## Problem
The example cards on the blueprint "New" form sit in a `flex flex-wrap` row with each card capped at
`max-w-[360px]`. Two capped cards plus the gap are wider than the form's content box, so each card
wraps onto its own line.

## Change
`src/components/blueprints/BlueprintNewBuild.vue`:
- the row becomes `grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`, so the column count follows
  the available width;
- the card drops `max-w-[360px]` and fills its column;
- the button row takes `mt-auto`, so buttons line up along a row whatever the description length.

No logic changes; the existing `data-testid`s are untouched.
