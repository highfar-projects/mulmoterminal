# feat: command palette — rows you use often and recently come first (#2533)

Part of #2411, step 7 (使う頻度と新しさで並べる), first part.

## What

A picked row is remembered; its weight is how often it was picked, each use counting half as much a
week later. The weight breaks ties in the ranking and nothing else: with nothing typed every row
ties, so used rows come first; with a query, a row that matches worse is never lifted over one that
matches better.

## Shape

- `paletteFrecency.ts` (pure): `frecencyScore`, `recordUse` (capped at `FRECENCY_MAX_ENTRIES`, the
  weakest go), `readFrecency` (malformed entries dropped), `isRememberedKind` (not a past prompt,
  a `/` / `#` hand-off or a `?` symbol, whose keys name something else next time).
- `usePaletteFrecency`: localStorage (`mt-palette-frecency`), read once per opening; a store that
  cannot be read or written only costs the ordering.
- `paletteRows`: sorted by (score, use, rankPaths order). With every use at 0 the result is exactly
  the old order — checked by running main's `paletteRows` beside the new one over generated inputs.

## Not here

Aliases, favorites, the second action panel.
