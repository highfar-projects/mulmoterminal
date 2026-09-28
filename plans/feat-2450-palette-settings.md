# feat: command palette — open a Settings section (#2450)

Step 3 (first half) of #2411.

## Decisions

- **Settings rows.** Each Settings section is a palette row.
  - Name: `settings.tabs.<id>`, the sidebar's own text.
  - Line: "Open in Settings", with the `settings` icon.
  - Never disabled.
  - Order: last on the grid; after the screens and terminals elsewhere.
- **Voice** is offered only where the machine can transcribe, asked the way Settings asks (`fetchVoiceInputStatus`, once per palette opening).
- **Opening.** `settingsOpener.ts` holds `settingsOpen` and `requestedSettingsTab` at module level. The palette sits in the toolbar and asks; the grid owns the modal and uses the same ref.
  - The modal takes the request on mount and on a later request, then clears it, so a plain open still starts on the default section.
  - The grid closes it on unmount, as the modal used to go with the grid's own ref.
- **`paletteRows` takes its lists as one object** (`PaletteSources`: screens, terminals, settings) instead of a growing list of positional arguments.

## Not in this step

Switching a setting directly from the palette (theme, sound, list/strip, sort order).
