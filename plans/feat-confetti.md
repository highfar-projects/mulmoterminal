# feat: confetti, by key and by event

A full-page celebration. Five styles (cracker, fireworks, sakura, rain, balloons); each celebration
picks one at random from the user's list.

## Triggers
- Keymap action `confetti` (an app action, so it works on every screen and from a header button),
  which also gives the command palette a "Throw confetti" row.
- Opt-in events in the `confetti.events` config list: `pr-merged` (a cell's PR poll saw the same PR
  go to merged), `turn-finished` (the sessions activity stream), `command-done` (a Run cell exit 0).
  Default is none. The same event inside a few seconds is one celebration, because a cell's poll
  and a roster poll can both see one merge.
- Konami code: every style at once.

## Shape
- `common/confetti.ts` — the setting, its sanitizer, the style pick. Server and browser share it.
- `src/utils/confettiParticles.ts` — pure spawn and step; `confettiDraw.ts` — canvas painting.
- `src/composables/useConfetti.ts` — setting ref, `fireConfetti*`, event cooldown;
  `ConfettiOverlay.vue` — one fixed, click-through canvas at the app root, drawing only while alive.
- Reduced motion: no confetti at all.
- Settings → Theme → Confetti: a tick per style (the last one is locked, since an empty list reads back as every style), a tick per event, and a Try it button; the config skill documents the key too.

## Not done
- A Settings section with checkboxes for styles and events.
- A release guide page and ChangeLog entry (written at publish time).
- `app-config.ts` joined the `max-lines` debt list in eslint.config.js; the better fix is splitting
  the sanitizers out of that file.
