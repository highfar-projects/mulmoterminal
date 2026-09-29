# Document packs: chaff 0.8 → 0.9

Issue: #2333

## Why

chaff 0.9.0 is published with `chaff feedback`. The review blueprint already drafts reports to chaff when the
pinned chaff has that command (#2332), so moving the pin turns the drafts on.

## What the checks read from chaff, and whether 0.9 changes it

On six sample documents (a statute excerpt, two contracts, an English contract, a manual, an itinerary), 0.8
and 0.9 give identical SARIF findings (rule, level, line), identical `tree --format json` addresses, and the
same `rules --json` keys.

## Change

The pin in `blueprints/docs/checks/chaff.sh` and the two skills that name it. The tester guide says that the
review blueprint drafts reports to chaff and sends nothing.

## Verification

A real review run with the published 0.9 pin (no `CHAFF_BIN`) on a contract chaff misreads: the draft appears,
and the report lists it.
