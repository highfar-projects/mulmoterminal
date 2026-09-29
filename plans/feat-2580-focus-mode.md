# feat: focus mode — full screen with Keyboard Lock (#2580)

Cmd/Ctrl+W, T and N belong to the browser, so they can never be MulmoTerminal shortcuts, and Esc
leaves full screen instead of reaching the terminal. In full screen a Chromium browser offers
`navigator.keyboard.lock()`, which hands them to the page.

- `src/composables/focusMode.ts`: `toggleFocusMode(env)` (pure over an injected document / keyboard):
  enter full screen, then lock the keyboard where the browser has Keyboard Lock; leave when already in.
  Outcomes: `locked`, `fullscreen-only`, `left`, `refused`. `runFocusMode` shows the outcome for a few
  seconds.
- Keymap action `focus-mode` (no default binding), handled by `useGridKeys` next to `command-palette`
  (full screen is the app's, not a cell's); in the palette automatically.
- `FocusModeNotice.vue` (bottom centre, like the prefix-key hint): says the keys are captured, or that
  this browser cannot capture them (Safari, Firefox), or that full screen was refused.
- Strings in five locales; config guide (en/ja) and the keys skill.
