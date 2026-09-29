# Blueprints: document packs run chaffjs@0.15

Issue: #2641 (the "あわせて" part only)

chaffjs 0.15.0 is published, with @chaffjs/lang-ja 0.14.0 and @chaffjs/lang-en 0.13.0. The pin moves in
`blueprints/docs/checks/chaff.sh` and in the two skills that name it.

## What changed for the packs

- The eight sample documents were compared between 0.14 and 0.15 by content (rule, file and line for SARIF with
  and without `--experimental`; addresses for `tree --format json`): no difference.
- Run directly on Node 22.12 (MulmoTerminal's floor), 0.15 gave the same findings as on 24, and `tree` worked.
- **A genre chaff does not know now stops the run.** Under 0.14 a `chaff.yaml` naming `legal/contract` loaded,
  checked nothing and exited 0; under 0.15 `rules --json` and a lint both exit 1 and say which genres there are.
  No pack writes a genre itself: the style pack's rules step picks one from `chaff genres`, and its check
  (`style/checks/rules.mjs`) already fails when `rules --json` does, so a mistyped genre is now caught there
  instead of passing silently. Every `chaff.yaml` written by earlier real builds names `technical/readme`.

## Verification

- The comparison and the Node 22.12 run above.
- The unknown-genre probe on 0.14 and 0.15.
- A real polish build from its example (お知らせ) on the test server, on 0.15, to the end.
