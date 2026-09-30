# feat: set a shortcut in Settings by pressing it (#2619)

Part of #2616. Revisits #1888, withdrawn then because "the problem was finding the mechanism, not
editing it"; the umbrella's feedback is that editing it through an agent is the friction.

## What

Settings → Keyboard shortcuts gives each action row **Change** (records the next keystroke and saves
it) and **Clear**. The save is one entry on the keymap ON DISK (`POST /api/config/keymap/binding`,
`server/config/keymap-binding-route.ts`), and the answer becomes the live keymap, so the key works at
once.

## Decisions

- **Recorded as `parseKeyBinding` reads** (`common/keyRecording.ts`, `bindingFromEvent`): modifiers in
  the guide's order, then `KeyboardEvent.key`. Pinned by a round-trip property: for every key and
  modifier set, the recorded binding parses back to a binding that matches the very event.
  A modifier alone keeps listening; a key a binding cannot name (the space bar, an unidentified key,
  and `+`, the separator itself) is refused with a message rather than saved as a binding that never
  fires.
- **While recording, the app's own shortcuts stand down.** They are capture-phase `window` listeners
  registered before the recorder, so `useCaptureKeydown` checks a shared `shortcutRecording` flag; the
  recorder stops the event from reaching anything else (the modal's Escape included). A bare Escape
  cancels.
- **Checked like the server's start**: a binding `validateKeymap` calls fatal for that action is refused
  (409 with the reasons); anything else it says (the browser keeps the key, a duplicate) comes back as
  warnings shown under the row.
- **Single keystrokes only.** Two-key sequences and `send` are still the file or the keys skill.

## Verification

- Specs: `keyRecording.spec.ts` (the round-trip property over keys × modifier sets; pending; refusals),
  `keymap-binding-route.spec.ts` (against the keymap on disk, clear, fatal refused with nothing written,
  a reserved key saved with a warning, bad input), `ShortcutBindingControl.spec.ts` (records a chord,
  Escape cancels and nothing else sees the key, unusable keys, clear, unmount mid-record),
  `useCaptureKeydown.spec.ts` (handlers stand down while recording). Each decision was inverted and the
  specs went red.
