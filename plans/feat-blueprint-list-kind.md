# Blueprints: the build list names what each build makes

Issue: #2452

## Why

Builds now chain in one folder: a style, then writing with it, then polishing (#2415). The list showed only the folder name and the current step, or 完了 once done. So a finished chain was several identical lines, and the only way to tell them apart was to open each one.

## Shape

- The run summary gains `usecaseTitle`: the usecase pack's manifest title, or `null` when the manifest cannot be read (for example, a market pack since removed). It defaults to `null`, so a summary without the field still parses.
- `summarizeRun` takes it as an argument. `list()` reads each distinct usecase pack once per listing, however many builds share it; the list is polled, and the manifests are a few small files.
- The sidebar shows the title under the folder name. There is no line for a build whose pack could not be read.

## Verification

- `list()`: a real pack gives its title, and an unreadable one gives `null`, not a failure.
- The sidebar shows the titles, and no line for a build without one.
- Each decision inverted in turn goes red.
- On the test server, the list of real builds names each one, and the three `bp-chain-test` builds (尋ねる, 確かめる, 読み解く) are told apart.
