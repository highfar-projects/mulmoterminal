# feat: command palette — a leading symbol narrows the search (#2462)

Step 2 of the order agreed on #2411.

## Decisions

- `scopeOf` (pure) reads the query:
  - `>` → action rows only
  - `@` → terminal rows only
  - `?` → the list of symbols
  - The symbol, and the spaces after it, are dropped before matching.
  - A symbol later in the text is ordinary text.
- `?` rows are a `prefix` kind. Picking one puts its symbol in the box and keeps the palette open; nothing runs.
- `/` (files) and `#` (content) are left for the steps that add those rows.
- The placeholder mentions `?`.
