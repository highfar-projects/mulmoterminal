# feat: collect a glossary from documents and feed it to chaff (#2713)

Part 3 of #2641. A new usecase on the documents base, 「用語をそろえる（用語集をつくって chaff に入れる）」
(`blueprints/glossary`).

## Steps

1. **collect** — `.blueprint/glossary.json`: per term, its definitions (quoted), the spellings found (each quoted),
   the spelling to use (`preferred`) and whether it is jargon. Nothing in the repository changes.
2. **apply** (after a person approves the glossary, shown as `.blueprint/glossary.txt`) — only when the answer asks,
   the spellings go into the folder's `chaff.yaml` (`prefer: { avoided: preferred }`, `jargon`, `preferred-term`
   turned on), then `.blueprint/glossary-report.md`.

## What the machine checks

- `collect` (`checks/terms.mjs`, `checks/glossary.mjs collect`): every term chaff's tree reads as defined
  (`kind: definition`) is in the glossary with a definition from that document; a definition's quotation contains the
  term (or one of its spellings); a spelling's quotation contains that spelling; a term spelled more than one way names
  one of them as `preferred`; every quotation is in its document (`chaff cite`).
- `apply`: with 「入れる」, `chaff.yaml` loads, every line it had before is still there, `preferred-term` is not off,
  every jargon term is listed, and chaff reports `preferred-term` in every document that still writes an avoided
  spelling on its own — the proof the file works. With 「入れない」, `chaff.yaml` is exactly as it was.
- The report names every term in its glossary section and every term defined more than once, each as a whole word
  (`namedIn`), and the documents and the glossary are unchanged since `collect`.

`namedIn` moved from the summarize pack into the docs base's `markdown.mjs`, which both packs use.

The documents are not changed: making them use one spelling is 「文書を整える」's work, which follows the new
`chaff.yaml`. Example: a telework policy and guide written for it, where 「社員」 is defined differently in each and
サーバー / サーバ and ユーザー / ユーザ are mixed.
