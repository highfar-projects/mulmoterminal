---
name: blueprint-from-collection-import
description: "Move the copied collection's records into D1 and the files they point at into R2, proven on a fresh local state."
---

# Move the records in

Read `.blueprint/source/source.json` first. If `records` is `false`, only the shape was copied: there is nothing to
move. Add a `yarn import-source` script that says so and exits 0, and stop.

Otherwise the records are in `.blueprint/source/collections/<slug>/records.jsonl` (one JSON object per line, as the
collection stored them), and the files they point at are under `.blueprint/source/files/`, at the path the record
names.

1. Add `yarn import-source <where>`, where `<where>` is wrangler's own location flags — `--local`,
   `--local --persist-to <dir>`, or `--remote` — passed unchanged to every wrangler call it makes. It must not apply
   migrations itself or pick a location of its own: the check points it at a fresh state it has already migrated.
2. It turns the records into SQL — every collection in `source.json`, the ones linked to first so references have
   something to point at — writes that to a temporary `.sql` file, and runs
   `yarn wrangler d1 execute DB <where> --file <that file> --yes`. Keep the part that turns records into statements
   a module of its own, so a test can run it.
3. Names follow the spec and the pack's `spec/conversion.md` ("表と列の名前" and "Cloudflare（D1 と R2）"): the table
   is the collection's slug with `-` as `_`; a stored field's column is its key, unchanged; a boolean is `0`/`1`, a
   date stays its ISO text, a `ref` keeps the referenced primary key, a `table` field's rows go to its child table.
4. Running it twice leaves the same rows: insert with an upsert on the primary key
   (`INSERT … ON CONFLICT (<key>) DO UPDATE SET …`), and replace a record's child rows with it. Not `INSERT OR REPLACE`:
   it deletes the row and inserts a new one, so every column the import does not write goes back to its default.
5. Files: when a record points at an `image` / `file`, add an R2 binding to `wrangler.jsonc`
   (`"r2_buckets": [{ "binding": "FILES", "bucket_name": "<app>-files" }]`), write that bucket name to
   `.blueprint/r2-bucket`, and upload each file the source has with
   `yarn wrangler r2 object put <bucket>/<path> --file .blueprint/source/files/<path> <where>`, the key being the path
   the record names. The Worker serves them from the binding to the screens. A file the source did not have is left
   out and reported.
6. A record that does not fit (a value the column refuses, a reference to nothing) is not dropped silently: the
   script stops and names the collection, the record's primary key and the field.
7. `test/import.test.ts`: in the Workers runtime, run the statements the module builds against the test D1 and read a
   record of each collection back.
8. Run `yarn import-source --local` once, so `yarn start` shows the records. Say in the README how the records were
   moved: `yarn import-source --local` fills what `yarn start` serves, and `--remote` is what moves them to
   production.

Done when the check passes: into a fresh local state with the migrations applied, run twice, every collection has as
many rows as it had records, every stored field reads back equal to the source, every pointed-at file is in the R2
bucket with the source's bytes, and `yarn test` passes.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Never use `--remote` in this step: it writes to the person's Cloudflare account, which only the publish steps are
  approved to do.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
