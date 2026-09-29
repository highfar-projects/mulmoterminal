# feat: the toolbar's operations as named actions (#2639)

Follows #2635: one name per operation, reachable as a header button (`run: "action"`), a `keymap`
binding, and the command palette.

## Names (`common/appActions.ts`, all `KeymapAction`s)

- `screen-terminals` `screen-collections` `screen-feeds` `screen-accounting` `screen-files`
  `screen-wiki` `screen-prs` `screen-rooms` `screen-blueprints` `screen-worklog`
- `settings-open` `sound-toggle` `view-toggle` `order-auto` `order-manual` `order-priority`

## Dispatch

- `runAppAction(action)` (`src/composables/runAppAction.ts`) calls what the toolbar and palette
  already call: `SCREEN_OPENERS`, `settingsOpen`, `useSoundEnabled().toggle`, and the grid's
  `paletteGridView` (view / order). It returns false for a screen that is not set up (the
  toolbar's gating, `visibleScreens`) or a view / order with no grid.
- Keys: on the grid `useGridKeys.runAction` runs them before the grid's gate (like
  `command-palette` / `focus-mode`); on every other screen `usePaletteKeyAnywhere` takes their
  single-key bindings.
- Header button: `runHeaderButton` runs an app action directly and reports a refusal.
- The palette does NOT list them as action rows: it already has a screen row, a Settings row and a
  choice row for each, and a second row per operation would be noise.

## Out of scope

- The notification bell, the phone link, the update badge and the GitHub star: popovers or
  one-time prompts, with nothing a key would usefully do.
