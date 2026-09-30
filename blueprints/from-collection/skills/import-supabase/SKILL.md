---
name: blueprint-from-collection-import
description: "Move the copied collection's records into Postgres and the files they point at into Storage, proven on a freshly reset local database."
---

# Move the records in

Read `.blueprint/source/source.json` first. If `records` is `false`, only the shape was copied: there is nothing to
move. Add a `yarn import-source` script that says so and exits 0, and stop.

Otherwise the records are in `.blueprint/source/collections/<slug>/records.jsonl` (one JSON object per line, as the
collection stored them), and the files they point at are under `.blueprint/source/files/`, at the path the record
names.

1. Add `yarn import-source <where> [--owner <email>]`, where `<where>` is `--local` or `--linked`, passed to every
   Supabase CLI call it makes (`yarn supabase …`). It never takes or reads a secret key, and it does not reset or
   migrate the database: the check has already done that.
2. It turns the records into SQL — every collection in `source.json`, the ones linked to first so references have
   something to point at — writes that to a temporary `.sql` file, and runs `yarn supabase db query <where> --file <it>`.
   That command runs ONE statement only (more are refused as "multiple commands"), so wrap the whole import in one
   `do $$ begin … end $$;` block. Keep the part that turns records into statements a module of its own, so a test can
   run it.
3. Names and types follow the spec and the pack's `spec/conversion.md` ("表と列の名前" and "Supabase（Postgres と
   Storage）"): the table is the collection's slug with `-` as `_`; a stored field's column is its key, unchanged; a
   boolean is a boolean, a date a `date` or `timestamptz`, a `ref` keeps the referenced primary key, a `table` field's
   rows go to its child table.
4. Running it twice leaves the same rows: insert with an upsert on the primary key
   (`insert … on conflict (<key>) do update set …`), and replace a record's child rows with it.
5. Who owns the imported rows is the spec's decision. By default: `--owner <email>` names the account, looked up with
   `yarn supabase db query <where> "select id from auth.users where email = '…'"`; without it, locally, the first
   seeded user. Refuse, with the reason, when the owner cannot be found.
6. Files: when a record points at an `image` / `file`, create the bucket in a migration
   (`insert into storage.buckets (id, name, public) values ('<bucket>', '<bucket>', false) on conflict do nothing;`)
   with Storage policies (`storage.objects`) that follow the spec's read and write rules, write its name to
   `.blueprint/supabase-bucket`, and upload each file the source has with
   `yarn supabase storage cp .blueprint/source/files/<path> ss:///<bucket>/<path> <where> --experimental`, the key being
   the path the record names. `storage cp` does not overwrite (a second run is refused as a duplicate), so remove the
   object first with `yarn supabase storage rm ss:///<bucket>/<path> <where> --experimental --yes`, which succeeds when
   there is none. A file the source did not have is left out and reported.
7. A record that does not fit (a value the column refuses, a reference to nothing) is not dropped silently: the
   script stops and names the collection, the record's primary key and the field.
8. `test/import.test.ts`: against the local stack, run the statements the module builds and read a record of each
   collection back.
9. Run `yarn import-source --local` once, so `yarn start` shows the records. Say in the README how the records were
   moved: `yarn import-source --local` fills the local stack, and `--linked --owner <email>` is what moves them to
   production.

Done when the check passes: into a database reset to the migrations and the seed, run twice, every collection has as
many rows as it had records, every stored field reads back equal to the source, every pointed-at file is in the
Storage bucket with the source's bytes, and `yarn test` passes.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Do not run `git init`: a new repository loses the folder's trust and the next unattended step stops at Claude
  Code's trust prompt. The user adds git themselves after the build if they want it.
- Never use `--linked` in this step: it writes to the person's Supabase project, which only the publish steps are
  approved to do.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
