# feat: instant tooltips via `data-tip` (#2315)

Direction from #2311: the UI stays icon-first, and the words go in a tip that appears at once.
The native `title` tip is delayed by the browser and the delay cannot be set, so an icon-only
button explains itself too late to help.

## Mechanism

- Elements carry `data-tip="…"` instead of `title="…"`.
- `installDataTips()` (called once from `App.vue`) listens on the document for `pointerover`,
  `pointerout`, `focusin`, `focusout`. It resolves `closest("[data-tip]")` from the event target
  and opens the existing shared tip (`HoverTip.vue`, `useHoverTip`, #1235) against that element.
  The shared tip already handles placement outside an `overflow-hidden` cell, being the only tip
  on screen, and closing on scroll / resize / pointerdown.
- The anchor gets `aria-describedby` while its tip is up, as the chips do.
- Touch pointers are ignored (a tap would open and close the tip in one gesture).
- Focus opens the tip only for keyboard focus (`:focus-visible`); a mouse click focuses a button
  right after the pointerdown that closed the tip, and reopening it there would be noise.
- A CSS-only `::after` tip is not an option: a cell is `overflow-hidden` and would clip it.

Measured in Chromium: `pointerover` reaches a `disabled` button (both on the button itself and on
a child span), so disabled buttons, which often say why they are disabled, keep their tip.

## Accessibility

`title` doubled as the accessible name for some elements. Where an element has no `aria-label`
and no text content, the replacement adds `aria-label` with the same words.

## Scope and split

- Native elements only. A component's own `title` prop is not an attribute and is left alone.
- PR 1: the mechanism, and the header surfaces (toolbar, cell, terminal header).
- Later PRs: the remaining files, until `grep 'title=' src` finds only component props.
- Out of scope: moving the English strings into vue-i18n.
