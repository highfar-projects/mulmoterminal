# Blueprints: offer the next document step in the same folder

Issue: #2413

## Why

The document packs chain in one folder: make a house style (style), then write with it (write) or polish with it (polish). Their interviews already offer 「このフォルダの規約」, but nothing on screen said so. After a style build, a person had to know to start a new build, pick the base again, pick write, type the same folder, and choose that answer.

## Shape

- A usecase manifest may list `next` usecases, each with the answers it fills in. This is an additive schema field, defaulting to `[]`. Initial entries:
  - style → write and polish, with 「このフォルダの規約」;
  - write → polish.
- The report view names the pair that ran (`pair`, as base and usecase slugs, read from their manifests; `null` when either cannot be read).
- `nextOptions` (pure) decides what a finished build offers: its usecase's `next` entries that are installed and sit on its base, in order.
- The run view's 「次にできること」 opens the new-build form through a one-time handoff (`blueprintsViewFollowUp` / `takeFollowUp`). The form takes it the way it takes an example: the folder, the base and the usecase; once that pair's interview loads, the answers.
  - It says what it continues.
  - It sends no preset.
  - A pair changed by hand drops the handoff and its note.
- A pack spec checks every `next`:
  - it names a shipped usecase;
  - that usecase sits on every base of the finished one;
  - its answers are ones that usecase's interview accepts.

## Verification

- `nextOptions`: installed and on the base, in order, with answers; nothing for missing, off-base, or base-named entries.
- The run view: offers the step, and hands over the base, usecase, answers, folder and the finished title. It offers nothing when the pair is unknown.
- The form: fills the folder, pair and answers, shows the note, starts without a preset, drops the note on a hand change, and is empty when opened again.
- The handoff is taken once.
- The report view names the pair from real packs.
- Each decision inverted in turn goes red.
- On the test server, in Japanese:
  - a finished style build offered 「文書を書く」 and 「文書を整える」;
  - choosing the first opened the form on the same folder, with write and 「このフォルダの規約」;
  - a finished write build offered 「文書を整える」.
