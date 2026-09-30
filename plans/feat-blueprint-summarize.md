# feat: summarize documents, every sentence backed by a quotation (#2710)

Part 2 of #2641. A new usecase on the documents base, 「要約する（一文ごとに原文で裏付けて）」 (`blueprints/summarize`).

## Steps

1. **summarize** — the agent writes `.blueprint/summary.json`: `sentences` (each `text` with `citations`:
   `source` / `address` / `quote`) and `omitted` (a part left out on purpose, with `why`). Nothing in the repository
   changes.
2. **report** (after a person approves the summary, shown as `.blueprint/summary.txt` with where each sentence
   comes from) — `.blueprint/summary-report.md` with 要約 / 出どころ / 省いた部分.

## What the machine checks

- Every quotation is in its document at its address (`chaff cite`, the base's `quotationProblems`), and names one
  of the documents.
- **No part is dropped silently.** A document's parts (`checks/parts.mjs`) are its articles if it has any, else its
  sections at the first level with more than one (under a single title heading, the sections below it). Each is
  cited by some sentence — a quotation anywhere under it counts — or listed in `omitted` with a reason, never both.
- **No number is made up.** Every number a sentence states, width and thousands separators aside, appears in one
  of its quotations or in the name of a place it cites (第4条 says 4).
- The number of sentences is within the chosen length (5 / 10 / no limit).
- The report carries every sentence word for word in its summary section and names every part left out; the
  documents and the summary are fingerprinted at the first step and must be unchanged.

Whether a quotation really supports its sentence is the agent's reading, which the person approves at the gate.

`sectionText` (a report section's text, under `##` or `###`) moved from the compare pack into the docs base's
`markdown.mjs`, which both packs now use; `markdown.d.mts` gives it types.

Example: the ask example's expense manual, summarized in at most five sentences.
