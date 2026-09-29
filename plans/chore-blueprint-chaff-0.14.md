# Blueprints: document packs run chaffjs@0.14

Issue: #2557

chaffjs 0.14.0 is published, with @chaffjs/lang-ja 0.13.0 and @chaffjs/lang-en 0.12.0. The pin moves in `blueprints/docs/checks/chaff.sh` and in the two skills that name it.

## What changed for the packs

The eight sample documents were compared between 0.13 and 0.14 by content (rule, file and line for SARIF with and without `--experimental`; addresses for `tree --format json`):

- `itinerary.md`'s tree: three `quantity` nodes (lines 3, 10 and 16) are gone. They have no address, so no citation and no place name can point at them, and no pack reads `quantity` nodes.

Everything else is the same. The commands and flags the packs use (`--sarif <path>`, `--compact`, `--experimental`, `tree --format json`, `rules --json`, `cite`, `feedback`) are all in 0.14's `--help`.

Run directly on Node 22.12 (MulmoTerminal's floor), 0.14 gave the same findings as on 24, and `tree` worked.

## Verification

- The comparison above, and the Node 22.12 run.
- A real verify build from its example (the itinerary, where the one difference was) on the test server, on 0.14, to the end.
