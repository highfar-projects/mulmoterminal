# Blueprints: document packs run chaffjs@0.13

Issue: #2541

chaffjs 0.13.0 is published, with @chaffjs/lang-ja 0.12.0 and @chaffjs/lang-en 0.11.0. The pin moves in `blueprints/docs/checks/chaff.sh` and in the two skills that name it. The dated setup guide for 6.8.0 still says 0.11: it is a snapshot and stays as it was.

## What changed for the packs

The eight sample documents were compared between 0.11 and 0.13 by content (rule, file and line for SARIF with and without `--experimental`; addresses for `tree --format json`):

- `ja-manual.md` with `--experimental`: `no-mixed-desumasu` moves (reported at lines 13, 13 and 21 on 0.11, at line 17 on 0.13). Only the review pack reads experimental results, and it keeps just the three structure rules, so nothing reads it.

Everything else is the same.

## Node

0.13 declares `engines: node >=24` (as 0.11 already did) and now imports `globSync` from `node:fs`, which Node has had since 22. MulmoTerminal requires Node 22.12 or later: run directly on Node 22.12, 0.13 gave the same findings as on 24, and `tree` worked.

Found on the way: on this machine a stray `node` package in `/private/tmp/node_modules/.bin` (Node 18) is picked up by `npx` run from anywhere under `/private/tmp`, and 0.13 then fails on `globSync`. That is the machine, not the packs: `npx` from the project folder resolves the user's own Node.

## Verification

- The comparison above, and the Node 22.12 run.
- A real review build from its example on the test server, on 0.13, to the end.
