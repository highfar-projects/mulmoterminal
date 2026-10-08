# feat: command palette — run a collection's actions (#2471)

Step 4 of the order agreed on #2411.

## Decisions

- **`GET /api/collections/actions`** returns each collection's slug, title, icon and collection-level actions, and no records. It is scoped by `?project=` like the other collection routes.
  - It is new to this repo. MulmoClaude has no equivalent, and `/detail` carries every record, too much to fetch per collection on each palette opening.
  - It is mounted from its own module (`collectionActionIndexRoute.ts`), reusing the collection routes' `guarded`, because `collections.ts` is at its `max-lines` bound.
  - `collectionActionIndex` (pure) drops collections with no such action, and skips `mutate`, which the schema refuses there anyway.
- **Wire type.** `common/collectionActions.ts` holds the shape and the guard the client parses with.
- **Palette.** It reads the list once as it opens, for the project the Collections surface is on.
  - Rows read "Collection: Action".
  - The key includes the slug, so two collections with one title stay two rows.
  - The rows sit with the terminal's commands, and `>` finds them.
- **Running.** A pick runs through the plugin's `collectionUi()`: `runCollectionAction`, then `startChat` with the seed prompt.
  - An agent action (`dispatched`) starts no chat, as the collection's own button does.

## Not in this step

Record-level actions: they need a record picked first (the second action panel).
