# fix: view-data GET honours `?ids=` / `?fields=` (#2901)

## Problem

`GET /api/collections/:slug/view-data` ignored its query string and returned every record with
every field as `{ items }`. The contract custom views are written against
(`@mulmoclaude/core` `custom-view.md`) and MulmoClaude's route both promise:

- `?ids=x,y` — only those records (unknown ids reported in `missing`)
- `?fields=a,b` — only those columns, primary key always included
- `{ collection, count, items, missing?, warning? }` as the response
- a 400 `{ error }` for an unprojected read of more than `MAX_UNSELECTIVE_ITEMS` records

## Change

Route the handler through `manageCollectionHandlerFor(resolveProjectRoot(req).workspaceRoot)`
with `action: "getItems"`, as `viewDataQueryHandler` already does for `queryItems`. A JSON result
is forwarded as 200; a bare diagnostic string becomes 400 `{ error }` (MulmoClaude's
`sendToolResult`). The list params are parsed the way MulmoClaude's `parseListParam` does —
trimmed, empties dropped — in a pure function of its own.

## Decision: refuse, do not merely warn

An unprojected read past the cap is refused, as MulmoClaude does. Both apps read the same view
HTML from the same workspace, so a view that does this already fails under MulmoClaude; letting
MulmoTerminal accept it would only hide that. The response stays a superset of `{ items }`, so a
view destructuring `items` keeps working.

## Tests

- `?ids=` returns only that record and reports an unknown id in `missing`
- `?fields=` returns only the primary key and the named field
- an unprojected read of a collection over the cap is a 400 with `{ error }`; the same read with
  `?fields=` is a 200
- `parseListParam`: comma string, repeated param, trimming, empties, non-string input
