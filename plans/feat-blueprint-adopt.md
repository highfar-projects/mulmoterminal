# feat: adopt chaff in an existing folder of documents (#2721)

Part 4 of #2641. A new usecase on the documents base, 「文書のフォルダに chaff を入れる（今ある指摘は棚に上げて）」
(`blueprints/adopt`).

## Steps

1. **survey** — measure what chaff reports on the named places today as the genre of the chosen kind
   (`kinds.json`, chaff 0.16's genres), and propose the setup in `.blueprint/adopt.json`. Nothing changes.
2. **apply** (after the gate shows the count by rule) — `chaff.yaml` for the genre, `chaff baseline` to shelve today's
   findings in `.chaff-baseline.json`, and, when asked, `.github/workflows/chaff.yml` from the pack's template; then
   the report.

## What the machine checks

- survey: the recorded genre is the chosen kind's, and the recorded count is what chaff reports now with `--genre`.
- apply: `chaff rules --json` loads and detects that genre; every non-comment line the folder's `chaff.yaml` had is
  still there (`lostLines`, moved into the docs base's `config.mjs` from the glossary pack, which now uses it too); the
  baseline exists and holds at least as many findings as were measured; chaff reports no warning or error on the
  places any more; and the workflow is there when asked and absent when not.
- The workflow (`checks/setup.mjs`, `workflowProblems`) runs on pull requests, runs `npx -y chaffjs@0.16` on every
  place with `--sarif`, uploads it with `github/codeql-action/upload-sarif`, declares `contents: read` at the top,
  grants `security-events: write` to the job, checks out with `persist-credentials: false`, and takes no write right
  to contents or pull requests. The template pins the actions the way the reference workflows do.
- The report names `chaff.yaml`, `.chaff-baseline.json` and the workflow when one was made.

The documents are not changed. Example: two help pages written for it, each with one sentence over the manual
genre's length limit.
