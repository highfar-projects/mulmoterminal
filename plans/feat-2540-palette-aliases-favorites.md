# feat: command palette — aliases and favorites from the config file (#2540)

Part of #2411, step 7 (別名・お気に入り). Decided with the user: kept in `~/.mulmoterminal/config.json`
and written there (by hand or by the keys skill); setting them from the palette comes with the
second action panel.

## What

- `paletteAliases: { "<alias>": "<row key>" }` — typing the alias exactly (case and surrounding
  spaces ignored) puts that row first; the alias is searched as part of the row. Within the scope
  typed only.
- `paletteFavorites: ["<row key>", …]` — with nothing typed, first, in the order written, above what
  frecency puts first.

A row key is the palette's own name for a row (`rowKey`, the row's `data-action`); the keys skill
lists the forms. A key naming no row is ignored.

## Shape

- `common/paletteConfig.ts`: the sanitizers both sides use (strings only, trimmed, capped).
- Server: two global keys in `AppConfig` (load, POST merge, public view); `paletteAliases` is guarded
  as an object field and `paletteFavorites` as an array field, so a malformed POST is refused rather
  than wiping them. Documented in the keys skill (settings-coverage pins the owner).
- Client: `useAppConfig` singletons, like `customAgents`.
- `paletteShortcuts.ts` (pure): `aliasesByKey`, `aliasTarget`, `pinRows`. `paletteRows` appends
  aliases to the search text, then pins favorites (nothing typed) and the exact alias (always).
  With neither configured the rows are exactly the old ones — checked by running main's
  `paletteRows` beside the new one over generated inputs.
