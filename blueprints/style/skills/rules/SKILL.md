---
name: blueprint-style-rules
description: "Measure the models with chaff, then write the style twice: chaff.yaml for what a machine checks, STYLE.md for what the writer reads — with a reason for every decision."
---

# Write the style

The style ends up in two places, and they do different jobs:

- **`chaff.yaml`** — what a machine checks on every document: the genre, the language, how strict each
  rule is, the team's own words. chaff is a linter; it never judges meaning and never rewrites.
- **`STYLE.md`** — what the writer (you, in a later build, or a person) reads and follows: voice, sentence
  endings, terms, structure. Everything a machine cannot measure goes here.

Read `.blueprint/answers.json` for the kind of document, the language, the audience and how strict to be.
Run chaff from the folder as `sh <base pack>/checks/chaff.sh …` — the wrapper the checks use, so what you
measure is what they will measure. Below it is written `chaff …` for short.

## 1. Measure

- **Genre**: `chaff genres` lists them. Pick the nearest to the answer `kind`. For contracts,
  rules, papers or books there is no dedicated genre yet: pick the closest (`technical/spec` for rules and
  contracts, `blog/essay` for long prose) and say so in the report.
- **Language**: from the answer, or what chaff detects on the sources.
- **Thresholds**: `chaff eval .blueprint/sources` sweeps each rule's limits over the models and
  recommends one. Read it rule by rule.
- **What fires now**: `chaff .blueprint/sources --genre <genre>` with no config yet.

## 2. Decide, one rule at a time

For each rule that fires on the models, or that `eval` recommends changing:

- **The models do it on purpose** (a long sentence is how this author writes): relax it, or turn it off.
- **The models slip** and the person chose "少し厳しく": keep it, and write in STYLE.md why the models are
  not the example there. The models must still pass, so this means a level they meet.
- **Never set a rule the models do not tell you about.** A style is measured, not imagined.

Write `chaff.yaml` with `genre`, `language` and `rules:` (`strict | normal | relaxed | off`). Add
`jargon:` for the team's own words only if the models show them. Record every level you set in
`.blueprint/rule-decisions.json`:

```json
{ "sentence-length": { "level": "relaxed", "why": "The models average long sentences on purpose: legal definitions run long." } }
```

chaff ignores a rule name it does not know. The check compares your decisions with what chaff actually
applied, so a misspelt rule shows up there rather than doing nothing.

## 3. The guide

`STYLE.md`, in the documents' language, with these sections (either name works):

- `## 誰に・何のために` / `## Audience and purpose` — from the answer `audience`.
- `## 語調と文末` / `## Voice and tone` — です・ます or だ・である, person, how direct. Quote a line from
  the models for each point.
- `## 用語と表記` / `## Terms and spelling` — preferred words and spellings, numerals, how English words
  are written. Only what the models show.
- `## 構成` / `## Structure` — how a document opens, heading depth, lists vs. prose.
- `## 機械が確かめること` / `## What chaff checks` — the rules you set and what each catches, so a reader
  knows which parts a machine enforces and which are theirs to keep.

## Done when

`node <usecase pack>/checks/rules.mjs` (with `BLUEPRINT_BASE` and `BLUEPRINT_USECASE` set to the pack folders from your prompt) passes: the config loads, every setting has a reason and is
in effect, the models raise no finding under their own style, and the guide has its sections. If a model
still trips a rule, do not delete the model: relax the rule, or say in the guide why that model is not
the example there and relax the rule to what it meets.
