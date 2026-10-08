# Blueprints: readable views of what a document gate asks to read

Issue: #2439

## Why

A document build's review gate lists what to read before approving (#2434). The two gates that decide the most pointed at JSON records:

- review, before its proposals: `findings.json`;
- verify, before its report: `facts.json`.

An ordinary user was reading key names around the content they came to check.

## Shape

- Label-free views, as decided on #2439. The documents may be Japanese or English, so a view is the records' own words, figures, quotes and places, with no headings to translate.
- Plain text (`.txt`), not Markdown. The words are quoted from documents, which may come from someone else. As Markdown, a quoted `![](…)`, `<img>` or link would be rendered by the Files view's Preview. Escaping every control character would clutter the source people read, and would be an enumeration of bad forms. Plain text is shown, never rendered.
- `blueprints/verify/checks/factsView.mjs`, `factsText` (pure):
  - events, amounts and totals, one line each, each with where it was read, the kinds kept apart;
  - a total names its parts by their labels;
  - a weekday is taken with or without its brackets;
  - figures are grouped in thousands;
  - a one-line field stays on one line.
- `blueprints/review/checks/findingsView.mjs`, `findingsText` (pure):
  - each finding gives its summary, its weight as ●●● / ●●○ / ●○○, its explanation, its quotes with their places, and its proposal (`→`);
  - the machine findings set aside follow, marked `×`, with why;
  - a proposal's or a reason's later lines are indented under the first, so a newline in the text cannot pass for the layout's own.
- The checks write the views only once the records check out:
  - `extract.mjs` writes `.blueprint/facts.txt`;
  - `findings.mjs` writes `.blueprint/findings.txt` whenever the findings verify, in both read and propose.

  A record that fails leaves the previous view as it was.
- The gates' `reads` point at the views.
- A pack spec requires a gate to read the view, not the record, wherever the pack's checks write one.

Left for later: outline, polish list and sources, which are shorter and closer to readable already.

## Verification

- The views: exact output for every kind, weekday forms, a start time alone, an empty kind, weights, an empty proposal, multi-line quotes, set-aside findings, newlines in one-line fields and in proposals and reasons, and markup kept as characters.
- The checks, run for real against the stand-in chaff:
  - extract writes the view and leaves it untouched on failure;
  - read writes the findings view.
- Packs: the gates read the views.
- Each decision inverted in turn goes red.
- Run by hand on two real finished builds (the review and verify examples), the views read as intended in the Files view.
