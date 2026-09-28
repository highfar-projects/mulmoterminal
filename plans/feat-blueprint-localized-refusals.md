# Blueprints: refusals in the person's language

Issue: #2373

## Why

A refusal to start or move a build reached the screen as the server's English sentence, whatever language the UI is in. The ones an ordinary user meets are the first thing they read when something is wrong: the folder is not trusted, another build is working there, an example's samples clash with their files.

## Shape

- `common/blueprint/refusal.ts`: a refusal as data (`code` plus the values its sentence needs), and `englishRefusal`, the API's English sentence derived from it so the two cannot drift.
- `BlueprintRefusal` takes a string or a refusal; the routes answer `{ error, refusal }`. Only the refusals a person can meet get a code: a malformed request or a path a browser would never send keeps English only.
- The client keeps `refusal` only when it parses (an unknown code from a newer server falls back to the English), and `failureText` words it through `blueprints.refusals.*` in every locale.

## Out of scope

- Texts recorded as a step's check output (the folder-busy note a Retry leaves, the untrusted note on a step): they are stored in the run's state, so wording them needs a code in the stored record.
- The market's registry refusals.

## Verification

- Every code worded in every locale with every value it carries; unknown or incomplete refusals fall back to English.
- Routes answer the code for each refusal a person meets; the executor's refusals carry theirs.
- The new-build form shows the translated text.
- Each decision inverted in turn goes red.
