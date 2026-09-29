# feat: focus mode — full screen with Keyboard Lock (#2580)

Cmd/Ctrl+W, T and N belong to the browser, so they can never be MulmoTerminal shortcuts, and Esc
leaves full screen instead of reaching the terminal. In full screen a Chromium browser offers
`navigator.keyboard.lock()`, which hands them to the page.

- `src/composables/focusMode.ts`: `toggleFocusMode(env)` (pure over an injected document / keyboard /
  secure-context flag): enter full screen, then lock ONLY `KeyW`/`KeyT`/`KeyN` — locking everything
  would take Esc too, and the held Esc that then leaves full screen repeats into the terminal. Leave
  (and unlock) when already in; a `fullscreenchange` to not-full-screen also unlocks. Outcomes:
  `locked`, `unlocked` (no Keyboard Lock, or refused), `insecure` (no secure context, where no
  browser offers it), `left`, `refused`. `runFocusMode` shows the outcome for a few seconds.
- Keymap action `focus-mode` (no default binding), handled by `useGridKeys` next to `command-palette`
  (full screen is the app's, not a cell's); in the palette automatically.
- `FocusModeNotice.vue` (bottom centre, like the prefix-key hint): says the keys are captured, or that
  they were not captured (Safari, Firefox, or plain http from another machine), or that full screen was refused.
- Strings in five locales; config guide (en/ja) and the keys skill.
