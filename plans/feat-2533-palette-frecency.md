# feat: command palette — rows you use often and recently come first (#2533)

Part of #2411, step 7 (使う頻度と新しさで並べる), first part.

## What

A picked row is remembered; its weight is how often it was picked, each use counting half as much a
week later. The weight breaks ties in the ranking and nothing else: with nothing typed every row
ties, so used rows come first; with a query, a row that matches worse is never lifted over one that
matches better.

## Shape

- `paletteFrecency.ts` (pure): `frecencyScore`, `recordUse` (capped at `FRECENCY_MAX_ENTRIES`, the
  weakest go), `readFrecency` (malformed entries dropped), `isRemembered`, an ALLOWLIST (action,
  screen, settings, choice, launch, resume, wiki, github, and an agent start): only a key that names
  the same row in every terminal and on every opening. Terminals, launcher starts, commands (per
  terminal's header config), collection actions (per project), prompts, hand-offs and symbols are out,
  and so is any kind added later until someone says it belongs. The sound switch is out too:
  its one id reads "Sound on" or "Sound off" depending on the state.
- Recorded once the pick has run: after a collection action succeeds, after a resume passes its
  re-check, and before a closing row runs.
- `usePaletteFrecency`: localStorage (`mt-palette-frecency`), read once per opening; a store that
  cannot be read or written only costs the ordering.
- `paletteRows`: sorted by (score, use, rankPaths order). With every use at 0 the result is exactly
  the old order — checked by running main's `paletteRows` beside the new one over generated inputs.

## Not here

Aliases, favorites, the second action panel.
