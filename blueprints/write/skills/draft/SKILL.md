---
name: blueprint-write-draft
description: "Write the next part of the outline to the house style, check it with chaff, cite what came from the sources, and mark it done."
---

# Write one part

Take the **first** part in `.blueprint/outline.json` whose status is `"todo"`. Write that part only; the
next round writes the next one.

## Before writing

Read `.blueprint/brief.md`, the part's `points`, and — when the folder has one — `STYLE.md`. Read the parts
already written, so terms, tone and numbering continue rather than restart.

## Write

- Write the part to its `file`, beginning with its title as a heading.
- Follow `STYLE.md`: voice, sentence endings, terms, structure. It is the part of the style a machine
  cannot check, and the reason it exists.
- Cover every one of the part's `points`.
- **State a fact only if it is in the brief's facts from sources**, or is common knowledge. Anything else is
  an open question for the report, not a sentence.

## Cite what came from the sources

For each sentence that states something taken from a source, record the source passage in
`.blueprint/citations/<part id>.json`:

```json
[{ "source": "annual-report.md", "address": "h1.2", "quote": "売上は前年比 12% 増えた" }]
```

`address` is where the passage sits in the source's tree: `sh <base pack>/checks/chaff.sh tree
.blueprint/sources/<file>` prints it (a heading's `h1.2`, an article's `3.2`). `quote` is the source's own
words, copied, not your paraphrase. The check runs `chaff cite` on each source.

## Check it yourself

`sh <base pack>/checks/chaff.sh <the part's file>` must report no warning or error. Fix the text, not the
style: if a rule seems wrong for this document, say so in the report rather than silencing it.

Then set the part's status to `"done"`.

## Done when

`node <usecase pack>/checks/parts.mjs progress` (with `BLUEPRINT_BASE` and `BLUEPRINT_USECASE` set to the
pack folders from your prompt) passes: one more part is done, every done part is written and raises no
finding, and every quotation is in its source.
