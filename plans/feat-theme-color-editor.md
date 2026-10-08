# feat: copy a theme and change its colours in Settings (#2623, first step)

Part of the Settings-in-the-GUI umbrella (#2616). By the user's choice the first step is the
smallest useful one: **copy an existing theme, then change its colours**. Renaming, the terminal's
`term` palette and designing from words stay with the `mulmoterminal-theme` skill.

## What changes

- `common/themeEntries.ts` — `duplicateTheme` (a built-in becomes `extends: <it>` with no colours of
  its own; a custom theme is copied whole), `copyId` (`<id>-copy`, `-copy-2`, …), `themeColorsFrom`
  (only theme variables, only colours), `themesWithColors` (a theme with no base must stay complete).
  `CUSTOM_THEMES_MAX` moved here from `app-config.ts`, which now reads it.
- `POST /api/config/themes/{duplicate,colors,remove}` (`server/config/theme-entry-routes.ts`), each
  under the config lock against the file on disk. `duplicate` answers the id it chose.
- `ThemeColorEditor.vue` under the theme picker: a name field + "Make a copy", and for a custom theme
  a colour picker per variable, Save / Discard / Remove.
- `previewCustomTheme` / `resolvedThemeVars` in `useTheme.ts`; `changeCustomThemes` in
  `themeEditing.ts` re-paints from the saved list after a change.

## Decisions

- **One theme per request, against the file** — the same reason as the other one-entry routes: a
  whole-list save drops a theme the skill wrote since the page loaded.
- **Preview is not save.** A picker change is painted at once (`applyCustomTheme` on the root);
  Save writes it; Discard, or closing Settings with an unsaved draft, calls `refreshTheme()` so the
  saved colours come back.
- A variable the theme does not set shows its base's colour and is not written until changed; a set
  one is bold.
- Removing the theme in use switches to its base (or the default).
- Validation on the server is still `customThemeSchema` (via `mergeConfigUpdate`); the routes refuse
  earlier with a problem word the editor can show.

## Verification

- Specs: the rules both ways, the routes against a temp HOME, the draft helpers, the editor.
- Real server + browser (demo HOME): copy Nord → a picker change repainted `--bg-base` with the file
  unchanged → Save wrote it → an unsaved change was undone on closing → it survived a reload →
  Remove went back to Nord. No console errors.
