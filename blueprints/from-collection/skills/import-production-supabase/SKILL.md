---
name: blueprint-from-collection-import-production
description: "After the publish, move the copied records and their files into the production Postgres and Storage with the import proven locally."
---

# Move the records into production

This step's gates are **deploy-production** and **credential**: the user has approved writing the copied records into
their Supabase project, through their own `supabase login` and the link the publish step made. If
`.blueprint/source/source.json` says `records` is `false`, there is nothing to do: stop.

1. Ask the person, through the blueprint question tool, which account owns the imported records (by default their
   own): they sign up in the published app first if they have not, and give the email.
2. Run `yarn import-source --linked --owner <that email>` — the same import the local step proved. Do not change it
   here; if it fails, say why and stop. The publish step already applied the migrations, which create the bucket.
3. Tell the person how many records went into each table, and how many files into the bucket.

Done when the check passes: the production database, read back through the Supabase CLI, has every record with every
stored field equal to the source, and every pointed-at file is in the Storage bucket named in
`.blueprint/supabase-bucket` with the source's bytes.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Never enable billing, deploy to production, delete data or handle a credential unless this step's gates say the
  user approved exactly that. Never handle the secret key: the CLI works through the person's login.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
