# The `{tier}/config` documents, as a picture

One declaration and the two documents it projects to, committed. `app.json` is the input;
`member.config.json` and `roster.config.json` are what `projectAppViews` (in `sharedapp`)
writes for the two audiences.

`test/server/backends/appViewGolden.spec.ts` regenerates and diffs them. Regenerate with:

```
UPDATE_GOLDEN=1 yarn vitest run test/server/backends/appViewGolden.spec.ts
```

## What this is for

The projection's own unit tests live in `sharedapp`, beside the code. These files are a
picture of the WIRE — the whole document, key order and all, in something a reviewer reads
in a diff. A change to what a published app carries shows up here as a changed file rather
than as a green test in another repository.

They are prettier-ignored (see `.prettierignore`): the canonical form is
`JSON.stringify(_, null, 2)`, which is what the spec writes.

mulmoserver used to hold a byte-for-byte copy, because it had no way to run the projection.
It imports `sharedapp` now and generates its own, so the copy — and the hand-sync problem
that came with it — is gone.

The declaration is deliberately one app carrying every distinction at once: a roster with
all five roles, a collection with a status field and an assignee field and mail, a
participant who reads one collection whole and another only their own row, and a submit
window that has to be lowered from ISO to millis. A golden that exercises one branch would
match itself and prove nothing.
