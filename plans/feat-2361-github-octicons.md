# feat: GitHub's own icons for GitHub destinations (#2361)

Decision 10 of the menu / icon cleanup in #2311.

## Changes

- `common/githubIcons.ts`: SVG path data of four Octicons (`repo`, `issue-opened`,
  `git-pull-request`, `play`), copied from `@primer/octicons` 19.38.0 (MIT, note kept in the file),
  and `githubIconOf()` which reads `github:<name>` and answers null for anything else. In `common/`
  because the server's default buttons write the string and the UI reads it.
- `GithubIcon.vue` draws one at `1em`; `IconGlyph.vue` picks Octicon or Material Symbol from a
  string, with separate size classes (an Octicon fills its grid, so the same font size looks larger).
- Used by: the path menu's Repository / Issues / Pull requests / Actions, the toolbar's Pull
  requests (`LauncherButton` via `IconGlyph`), and the row-2 header buttons (`Terminal.vue` via
  `IconGlyph`), so a user's own button can say `"icon": "github:git-pull-request"` too.
- `DEFAULT_BUTTONS`' `pr` button uses `github:git-pull-request`.
- Docs (header en/ja `icon` row, recipes, config note), the header skill, CLAUDE.md's icon rule.
- Two stale comments deferred from #2350's review (filesRowActions, usePasteImage).

## Decisions

- Copy the path data instead of depending on a package: four shapes, and a component that owns the
  paths needs no `v-html`.
- An unknown `github:` name falls back to the Material Symbols span and shows as text, the same as a
  misspelt Material name does today — no new failure mode.
