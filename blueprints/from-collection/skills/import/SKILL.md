---
name: blueprint-from-collection-import
description: "Move the copied collection's records, and the files they point at, into the app's database and data/files/."
---

# Move the records in

Read `.blueprint/source/source.json` first. If `records` is `false`, only the shape was copied: there is nothing to
move. Add a `yarn import-source` script that says so and exits 0, and stop.

Otherwise the records are in `.blueprint/source/collections/<slug>/records.jsonl` (one JSON object per line, as the
collection stored them), and the files they point at are under `.blueprint/source/files/`, at the path the record
names.

1. Add `yarn import-source <database path>`. It opens that database the way the app does (so the migrations run),
   then, for every collection in `source.json` — the ones linked to first, so references have something to point at —
   inserts each record into its table.
2. Names follow the spec and the pack's `spec/conversion.md` ("表と列の名前"): the table is the collection's slug with
   `-` as `_`; a stored field's column is its key, unchanged. Convert as the table says: a boolean is `0`/`1`, a date
   stays its ISO text, a `ref` keeps the referenced primary key, a `table` field's rows go to its child table.
3. A record's `image` / `file` value is a path: copy the file from `.blueprint/source/files/<path>` to
   `data/files/<path>` and keep the path in the column. A file the source did not have is left out and reported.
4. Running it twice leaves the same rows (insert or replace by primary key; child rows replaced with their parent).
5. A record that does not fit (a value the column refuses, a reference to nothing) is not dropped silently: the
   script stops and names the collection, the record's primary key and the field.
6. `test/import.test.ts`: import into a temporary database and read a record of each collection back.
7. Say in the README how the records were moved, and that `yarn import-source data/app.db` is what did it.

Done when the check passes: into a fresh temporary database, run twice, every collection has as many rows as it had
records, every stored field reads back equal to the source, every pointed-at file is in `data/files/`, and
`yarn test` passes.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
