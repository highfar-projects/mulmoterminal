---
name: blueprint-from-collection-import-production
description: "After the production publish, move the copied records and their files into production with the import proven on the emulators."
---

# Move the records into production

This step's gates are **deploy-production** and **credential**: the user has approved writing the copied records into
the production project with their own Application Default Credentials. If `.blueprint/source/source.json` says `records` is `false`, there is nothing to do: stop.

1. Check that Application Default Credentials exist (`gcloud auth application-default print-access-token`). If not,
   ask the person, through the blueprint question tool, to run `gcloud auth application-default login` and tell you
   when it is done. Do not create or download a service account key.
2. Run `yarn import-source --target prod` — the same import the emulator step proved. Do not change it here; if it
   fails, say why and stop.
3. If files were uploaded, `.blueprint/storage-bucket` names the production bucket (`<prod-project-id>.appspot.com` or
   `<prod-project-id>.firebasestorage.app`).
4. Tell the person how many records went into each collection.

Done when the check passes: production Firestore, read back with the person's token, has every record with every
stored field equal to the source, and every pointed-at file is in the production bucket.

## Always

- Read `.blueprint/spec.md` first. It is the agreed specification; do not widen it.
- When you need a decision, ask it through the blueprint question tool and stop. Do not guess.
- Never enable billing, deploy to production, delete data or handle a credential unless this step's gates say the
  user approved exactly that.
- Say you are done by stopping; the executor runs the check. Do not claim success yourself.
