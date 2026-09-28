# feat: translate the overlays' and menus' tooltips and aria-labels (#2408, part 3b)

The second half of part 3 (3a: `plans/feat-2408-i18n-tips-panes.md`): the full-screen overlays
(collections, accounting, GitHub, rooms, wiki, shared-app preview and access), the run / skill /
deck menus, the round-table menu, and the model / account / launch-panel controls.

## Change

- `src/i18n/tips/*.ts`: a `tips.overlays` section in all five bundles.
- Every tip and aria-label in those files, including the region / navigation landmarks' names,
  comes from `t()`. `GithubPrRepo`'s CI states and `SharedAppAccessPanel`'s access-subject notes
  are key tables (`CI_TITLE_KEY`, `SUBJECT_NOTE_KEY`); the round-table start tip is one message
  with `{seats}` and `{budget}`.
- `CollectionsBrowseOverlay` passes translated `label` / `description` to `LaunchAgentPicker`.
- `GridView` and `SharedAppPreview` use `$t` in the template rather than `useI18n()`: both sit at
  the 600-line limit, and the script lines `useI18n` adds would push them over. The debt list in
  eslint.config.js only ever shrinks, so it is not the place for them.

## Not translated

"GitHub" and "Wiki" (names), paths, commands, script and skill descriptions from config, room and
collection names.

## Left for part 4

`RemoteHostControl` and the rest of the toolbar; Settings.
