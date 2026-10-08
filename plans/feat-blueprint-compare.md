# feat: compare two versions of a document article by article (#2689)

Part 1 of #2641. A new usecase on the documents base, 「版を比べる（新旧対照表をつくる）」 (`blueprints/compare`).

## Steps

1. **pair** — the agent pairs every article of the old version with its article in the new one and writes
   `.blueprint/comparison.json`: `{ old, new, change: same | changed | added | removed, what }`. Pairing is by what an
   article says, so a renumbered or moved article is one pair. Nothing in the repository changes.
2. **report** (after a person approves the pairing, shown as `.blueprint/comparison.txt` with diff-like marks) —
   the comparison table in `.blueprint/compare-report.md`.

## What the machine decides

- Each article's body comes from `chaff tree`'s span (`checks/articles.mjs`), compared with spacing and the
  article's own number left out. A `same` pair whose text differs, and a `changed` pair whose text does not, are
  refused: whether anything changed is not the agent's judgement.
- Every article of both versions is in exactly one row; `added` has only `new`, `removed` only `old`.
- The report's table section names every changed, added and removed article (a name followed by a digit is not
  counted: "Article 1" is not in "Article 12"); both versions and the pairing are fingerprinted at the pair step
  and must be unchanged when the report is checked.

## Scope

Articles only (chaff's `article`): a document without them is refused with that reason. A change in a paragraph or
an item is a change of the article holding it. What a renumbering does to references elsewhere is named in the
report as not checked.

The example (`itaku-kaitei`) takes the review example's service contract as the old version and a revision made for
it: two articles changed, one added, one removed, and the last renumbered unchanged.

The pack test that an example ships every file its answers name now finds those answers from the interview's
`pick: "files"` questions instead of a fixed list of ids.
