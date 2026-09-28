# feat: path menu — Insert first, i18n file items, GitHub/GitLab section; GitHub mark on the toolbar (#2374)

Part of the menu / icon cleanup agreed in #2311.

## Changes

- `CellPathMenu.vue`: Insert a file path leads; the four file items go through vue-i18n
  (`pathMenu.*`, five locales). The repository section reads `forge` from `/api/git-remote`
  (the server already classifies GitHub / GitLab, incl. `gitlabHosts`) and gets a heading naming
  the forge — GitHub with its mark, GitLab as text (no GitLab mark in Octicons).
- `forgeLinks.ts`: pure mapping from `forge` to the section. GitHub: Repository / Issues / Pull
  requests / Actions. GitLab: Repository / Issues / Merge requests / Pipelines under `/-/`. Only an
  https `webUrl` is used, since it becomes a `window.open` target; an own-property lookup keeps a
  `kind` of `constructor` from matching.
- `common/githubIcons.ts` gains `mark-github`; the toolbar's Pull requests button uses it.
- Docs en/ja (header, basics, features, config) and the header skill.

## Decisions

- The forge's own words stay untranslated (GitHub, Merge requests, …): they name pages on that
  site, the way the forge's name does.
