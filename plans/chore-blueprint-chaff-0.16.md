# Blueprints: document packs run chaffjs@0.16

chaffjs 0.16.0 is published, with @chaffjs/lang-ja 0.15.0 and @chaffjs/lang-en 0.14.0. The pin moves in
`blueprints/docs/checks/chaff.sh` and in the skills that name it.

## What changed for the packs

The fifteen sample documents (the eight used before, plus the examples of summarize, glossary, compare and polish's
report and blog) were compared between 0.15 and 0.16 by content (SARIF with and without `--experimental`, and
`tree --format json`). Everything is the same except, with `--experimental`:

- `houkoku.md` (polish's report example): the three `latin-spacing` reports on 「9月」 are gone — the false report
  sent to chaff as isamu/lab#290 — and `excessive-hedging` now reports the stacked hedge on line 5.
- An older test contract: the `dangling-reference` on 「前契約の第9条」 — a reference into another document — is gone
  (isamu/lab#153).

The review example's own structure findings (第12条 that does not exist, the gap after 第4条, 「成果物」 defined twice)
are the same in both. On Node 22.12 (MulmoTerminal's floor) 0.16 gives the same findings as on 24, and `tree` works.

0.16 also adds genres for contracts, statutes, manuals, FAQs, glossaries, papers and more. Using them — polish's kinds,
the style pack's advice for contracts — is a separate change.

## Verification

- The comparison and the Node 22.12 run above.
- A real review build from its example on the test server, on 0.16, to the end.
