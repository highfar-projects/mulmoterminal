# feat: group header buttons into a folder (#2366)

Part of the #2311 cleanup: a `buttons` entry may hold `items`, drawn on row 2 as one icon that opens
a menu of the buttons inside. One level only.

## Shape

```json
{ "id": "ops", "icon": "construction", "label": "Operations",
  "items": [ { "id": "restart", "run": "action", "action": "restart", "label": "Restart the agent" } ] }
```

An entry is a folder when `items` is an array; it has no `run`.

## Server

- `config-schema.ts`: `HeaderFolder` / `HeaderEntry` types and `isHeaderFolder`; the writable (JSON
  Schema) side accepts a folder of 1–32 plain buttons, so nesting is unwritable.
- `header-config.ts`: `sanitizeEntry` routes an `items` entry to `sanitizeFolder`, whose children go
  through `sanitizeButton` — which needs a `run`, so a nested folder cannot load. A folder with no
  valid child is dropped. `withUniqueIds` keeps ids unique across the whole list (top-level ids win,
  a child repeating a taken id is dropped); it runs after sanitizing and again after the global /
  project merge. `flattenEntries` gives every button, children included.
- `header-resolve.ts`: `resolveEntry` gates a folder by its own `when`, filters its children as
  top-level buttons are filtered, and drops a folder left empty. `resolveButtonCommand` and
  `headerHasPrButton` read the flattened list, so a shell child runs by id and a `pr` child is seen.

## Client

- `useHeaderButtons.ts`: parses folders (children that pass as buttons; a folder with none dropped);
  `hasPickFileButton` looks inside folders.
- `HeaderButtonFolder.vue`: the trigger + teleported menu, on `useAnchoredMenu` (placement, arrows,
  Escape / Tab back to the trigger, outside click, scroll close). A pick is emitted to `Terminal.vue`,
  which runs it through the same `onHeaderButton` as a top-level button.
- `HeaderButtonGlyph.vue` / `headerButtonClasses.ts`: the glyph and the button class, shared by the
  folder trigger, its menu rows and the plain buttons.

## Decisions

- A folder with the same `id` in the project file replaces the global one whole (merge by `id`, as
  buttons do) — not a merge of the two folders' children.
- The 32 cap applies to top-level entries and, separately, to each folder's children.
