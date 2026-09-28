# Blueprints: document packs run chaffjs@0.11

Issue: #2445

chaffjs 0.11.0 is published, with @chaffjs/lang-ja 0.10.0 and @chaffjs/lang-en 0.9.0. The pin moves in `blueprints/docs/checks/chaff.sh` and in the two skills that name it.

## What changed for the packs

The eight sample documents were compared between 0.10 and 0.11 by content, not bytes, since the paths inside the output differ:

- SARIF, with and without `--experimental`: rule, file and line;
- `tree --format json` addresses;
- `rules --json`;
- whether `--help` offers `chaff feedback`.

Two differences:

- `ja-law.txt`: `ngram-repetition` at line 1 is no longer reported, with or without `--experimental`. That is fewer findings, which only helps the checks that require none (polish, write).
- `ja-manual.md`: `--experimental` adds `no-mixed-desumasu` at line 21. Only the review pack reads experimental results, and it keeps just the three structure rules, so nothing reads it.

Everything else is the same.

0.11 depends on `openai` and `@anthropic-ai/sdk`, so the first `npx -y chaffjs@0.11` downloads more. That is chaff's own concern, and nothing here calls those.

## Verification

- The comparison above.
- A real review build from its example on the test server, on 0.11, through its gate (which listed `.blueprint/findings.txt`) to the end.
