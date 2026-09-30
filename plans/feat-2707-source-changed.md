# Tell the person when a build's source changed after it was copied (#2707)

Decided 2026-09-30 (part of #2480): notice it, say so, and leave retaking to the person.

- At copy time `source.json` also records `source` (the answer that named it: a slug or `app:<id>`) and `fingerprint`
  (`server/blueprint/sourceFingerprint.ts`): sha256 over every copied file but `source.json`, sorted by path, each
  prefixed with its path and length. A `records.jsonl` counts by its lines sorted, since a store's list order is not
  promised.
- `GET /api/blueprints/runs/:id/source` reads the build's `source.json` (bounded), takes the same source again in memory
  with the same records flag, and answers `same` / `changed` (+ `takenAt`) / `unreadable` (+ reason) / `unknown` (no
  source, or a copy from before the fingerprint). Nothing is written.
- The run view asks once per build shown, not on every poll (a shared app's records are read from Firestore), and shows
  one line only for `changed`.

Not done: retaking the copy in place — the spec was written from the old copy.
