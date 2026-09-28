# Document packs: chaff 0.7 → 0.8

Issue: https://github.com/receptron/mulmoterminal/issues/2321

## Why

The packs pin `chaffjs@0.7` in `blueprints/docs/checks/chaff.sh` (and name it in two skills). chaff 0.8 adds
an English screen for English documents, statute reading without false alarms, and `chaff feedback`, which
the next document-pack work builds on.

## What the checks read from chaff, and whether 0.8 changes it

- SARIF findings (`findingsIn`: ruleId, level, location): identical between the versions on the sample documents.
- `cite` exit code (`quotationProblems`): 0.8 accepts the old item address (`3.1`) and the new one (`3.1.1`).
- `tree --format json` addresses (polish): changed for items directly under an article, but polish compares
  the original and the polished file with the same version in one check run.
- `rules --json` (workspace): same top-level keys.

## Change

Replace the pin in `chaff.sh` and the two skill mentions. Nothing else.

## Verification

The pack helpers run against the real published 0.8 (not the stand-in `CHAFF_BIN`): workspace check, findings,
cite, and tree. The blueprint specs (`test/server/blueprint`) pass.
