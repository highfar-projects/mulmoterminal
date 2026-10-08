# feat: schema-aware editing of `.mulmoterminal.json` in the Files pane (#2625)

Part of the Settings-in-the-GUI umbrella. Per-directory settings are edited in the Files pane
(#2624); this makes that editor know the file.

## What changes

- `GET /api/dir-config/schema` serves `dirConfigJsonSchema()` — the JSON Schema generated from
  `writableDirConfigSchema`, the same zod schema the server validates a save against.
- `writableDirConfigSchema` gains `backgroundImage` (string or `{ image, opacity?, fit? }`), the one
  key a directory's config is read for that the schema did not describe. A spec now pins the
  schema's properties to `DIR_CONFIG_KEYS`, so the next missing key is a red test.
- The CodeMirror editor, for a file named `.mulmoterminal.json` or `.mulmoterminal.local.json`,
  loads `codemirror-json-schema` (lazy chunk) and the schema, and uses `jsonSchema(schema)` in place
  of plain `json()`: completion of keys and enum values, and lint marks on values the schema rejects.
- A failed schema fetch falls back to plain JSON and is not cached, so the next open retries.

## Decisions

- **New dependency `codemirror-json-schema`** (user's choice over hand-writing completion). It is
  imported dynamically, so the main chunk does not grow with it.
- **Schema from the server, not bundled**: the zod schema lives in `server/`, and serving it keeps
  one source of truth for what a save accepts.

## Verification

- Specs: schema keys == `DIR_CONFIG_KEYS` (mutation-checked), editor helper file-name match,
  cached load, and fallback on fetch failure.
- Real server + Playwright: opening `.mulmoterminal.json` in the Files pane offered
  `headerTextColor` / `headerStatusColors` / `headerStatusTint` as completions and marked an
  unreadable colour and a misspelt key; no page errors.
