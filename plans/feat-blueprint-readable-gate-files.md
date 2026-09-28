# Blueprints: readable views of what a document gate asks to read

Issue: #2439

## Why

A document build's review gate lists what to read before approving (#2434). The two gates that decide the most pointed at JSON records:

- review, before its proposals: `findings.json`;
- verify, before its report: `facts.json`.

An ordinary user was reading key names around the content they came to check.

## Shape

- Label-free views, as decided on #2439. The documents may be Japanese or English, so a view is the records' own words, figures, quotes and places, with no headings to translate.
- `blueprints/verify/checks/factsView.mjs`, `factsMarkdown` (pure):
  - events, amounts and totals, one line each, each with where it was read, the kinds kept apart;
  - a total names its parts by their labels;
  - a weekday is taken with or without its brackets;
  - figures are grouped in thousands.
- `blueprints/review/checks/findingsView.mjs`, `findingsMarkdown` (pure):
  - each finding gives its summary, its weight as ●●● / ●●○ / ●○○, its explanation, its quotes with their places, and its proposal (`→`);
  - the machine findings set aside follow, struck through, with why.
- The checks write the views only once the records check out:
  - `extract.mjs` writes `.blueprint/facts.md`;
  - `findings.mjs` writes `.blueprint/findings.md` whenever the findings verify, in both read and propose.

  A record that fails leaves the previous view as it was.
- The gates' `reads` point at the views.
- A pack spec requires a gate to read the view, not the record, wherever the pack's checks write one.

Left for later: outline, polish list and sources, which are shorter and closer to readable already.

## Verification

- The views: exact output for every kind, weekday forms, a start time alone, an empty kind, weights, an empty proposal, multi-line quotes, set-aside findings.
- The checks, run for real against the stand-in chaff:
  - extract writes the view and leaves it untouched on failure;
  - read writes the findings view.
- Packs: the gates read the views.
- Each decision inverted in turn goes red.
- Run by hand on two real finished builds (the review and verify examples), the views read as intended, and the Files view shows them with a Preview.
