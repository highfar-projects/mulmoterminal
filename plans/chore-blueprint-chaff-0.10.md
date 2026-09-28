# Document packs: chaff 0.9 → 0.10

Issue: #2367

## Why

chaff 0.10.0 is published (lang-ja 0.9.0, lang-en 0.8.0). The packs follow the published chaff.

## What the checks read from chaff, and whether 0.10 changes it

On eight sample documents (a statute excerpt, contracts, an English contract, a manual, an itinerary, and the
contract and notice the examples ship), 0.9 and 0.10 give identical SARIF findings with and without
`--experimental`, identical `tree --format json` addresses, and the same `rules --json` keys. The one exception:
with `--experimental`, 0.10 adds the new `total-mismatch` rule on the itinerary. No pack reads it. review keeps
only the three structure rules from its experimental run, and the other packs run without `--experimental`.

## Change

The pin in `blueprints/docs/checks/chaff.sh` and the two skills that name it.

## Verification

The review and verify examples run to the end on the published 0.10, each from an empty folder.
