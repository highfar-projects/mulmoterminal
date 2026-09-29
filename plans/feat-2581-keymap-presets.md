# feat: recommended keymap per platform, applied from Settings (#2581)

Decided on the issue: apply a platform set from Settings → Keyboard shortcuts, showing the difference
first; the content is the keys skill's starter sets.

- `common/keymapPresets.ts` (pure): `KEYMAP_PRESETS` — Mac: `zoom-toggle` Alt+ArrowUp,
  `next-attention` Alt+ArrowDown (Option+Left/Right carry word motion in Mac terminals), plus the
  macOS line-editing `send` set; Windows/Linux: all four Alt+Arrows. `presetChanges(keymap, preset)`
  lists, per entry, `add` / `add-send` / `kept` (the action is already bound — its key stays) /
  `taken` (a binding already starts with that key). `withPreset` builds the whole keymap to write.
  A preset only adds; it never replaces or removes a binding.
- `POST /api/config/keymap-preset` (`config-routes.ts`, under the config lock like the palette
  favourites): the server works the additions out on the keymap IN THE FILE and writes the whole
  keymap. A tab's copy, or this process's, can miss a binding another mulmoterminal, the keys skill or
  a hand edit wrote since, and `keymap` is replaced whole — building on it would erase that. The
  client sends the list it showed (`expected`); if the file makes it different the server writes
  nothing and answers 409 with the file's keymap, and the panel redraws the list from it.
- `KeymapPresetPanel.vue` in the Keyboard shortcuts section: the list for this browser's platform
  (`reservedPlatformFor(navigator.platform)`), an **Add these** button, and one status line. The
  saved keymap is adopted with `setActiveKeymap`, so the keys work at once in this tab. Disabled
  when nothing would be added.
- Strings in five locales; Settings' `shortcuts` block moved to `src/i18n/shortcuts/` (the locale
  files are at their line cap). The intro no longer calls the whole section read-only.
- Guides (en/ja) and the keys skill say what the button adds and that it never replaces a binding.
