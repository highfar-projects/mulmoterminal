# Review pack: draft reports to chaff for the structure results it overturns

Issue: #2329

## Why

chaff gets better from the cases it gets wrong, and the review pack meets those cases first:

- **wrong**: a structure problem chaff reported that the review dismisses with a reason (`dismissed`, such as a
  reference into another law that the document names);
- **missed**: a finding of a structure kind (`dangling-reference`, `numbering-gap`, `duplicate-definition`) that
  the review found by reading, with no `machine` result behind it.

`chaff feedback` turns one such case into an issue draft that holds only a few lines around it, and sends
nothing. The pack drafts one per case and lists them in the report. The person decides whether to send any.

## Shape

- `blueprints/review/checks/candidates.mjs` (pure): the cases from `findings.json`, and the line a quotation
  starts on (a missed case needs `--line`; `chaff cite` already proved the quotation is in the document, and
  spaces and line breaks are ignored as cite ignores them).
- `blueprints/review/checks/feedback.mjs`: run by the report skill. It asks the pinned chaff whether it has
  `feedback` (`--help`). With it, the script runs `chaff feedback <file> --rule <rule> --line <n>` (wrong) or
  `--missed --line <n>` (missed), and moves each `.chaff-feedback.md` to `.blueprint/chaff-feedback/<id>.md`.
  It writes `.blueprint/chaff-feedback/index.json`: `{ supported, drafts: [{ id, kind, file, line, draft }] }`.
  It stops when the folder already has a `.chaff-feedback.md` of the person's own, rather than overwrite it.
  It never passes `--with-config`: the person's `chaff.yaml` stays out of the draft.
- `blueprints/review/checks/report.mjs`: when there are cases, the index must exist and cover exactly the
  cases computed now. With `supported`, each draft file must exist, and the report must name each draft
  under 「chaff への報告の下書き」 / "Drafts for chaff".
- The report skill says what the drafts are and how to send one (the command chaff printed), and that nothing
  was sent.

## Until chaff publishes `feedback`

The published chaff (0.8.0) has no `feedback`, so `supported` is false, no drafts are made, and the report says
so. Moving the pin to the first version with `feedback` turns the drafts on; nothing else changes.

## Verification

- `candidates.mjs` is covered both ways: dismissed and missed cases, a machine-backed finding (not a case), a
  non-structure kind (not a case), quotation lines with spaces and line breaks, a quotation not found.
- `feedback.mjs` and `report.mjs` run through the pack harness with a stand-in chaff that has, or lacks,
  `feedback`.
- A real run of the review pack with `CHAFF_BIN` pointing at a local chaff build that has `feedback`, on a
  contract with a planted false positive and a planted miss.
