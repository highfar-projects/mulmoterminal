# feat: command palette — switch theme, language and sound (#2455)

Step 3 (second half, first part) of #2411.

## Decisions

- **Rows.** A new `choice` row kind, built by the pure `paletteChoices`:
  - one per theme (built-in and custom), then Automatic and one per UI language, then one sound switch naming what it would do.
  - The theme and language in effect say "Current".
- **Applying.** `usePaletteChoices` uses the setters Settings and the toolbar use: `setTheme`, `uiLanguage`, `useSoundEnabled().toggle`.
  - A choice id is split at its FIRST colon (`choiceTarget`), since a custom theme id may hold one.
- **Order.** Choices follow the Settings sections: last on the grid, before the actions elsewhere.
- **i18n.** The palette's section moved into `src/i18n/commandPalette/<locale>.ts`, as `tips` and `blueprints` did, because en.ts and ja.ts went past `max-lines`.

## Not in this step

The list/strip view and the sort order (grid state), and font size.
