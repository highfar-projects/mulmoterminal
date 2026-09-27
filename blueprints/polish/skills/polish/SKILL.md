---
name: blueprint-polish-polish
description: "Polish the next file on the list to the house style without changing what it says, keep the original, and check it."
---

# Polish one file

Take the **first** file in `.blueprint/polish.json` whose status is `"todo"`. Polish that file only; the
next round takes the next one.

## First, keep the original

Copy the file to `.blueprint/originals/<the same path>` before changing anything (create the folders).
The check compares against it, and it is how the person undoes a change.

## What may change, and what may not

The document must still **say the same thing**. What changes is how it is said.

- **May change**: wording, sentence length and endings, spacing, spelling to the team's terms, splitting a
  long sentence or paragraph, removing padding.
- **May not change** — the check compares these with the original and fails on any difference:
  - the headings, in order and word for word (other documents link to them);
  - the articles, sections and items chaff reads as the document's structure (`chaff tree`), so a
    reference such as "第3条第2項" or "Section 4.2" still points at the same place;
  - code blocks, byte for byte;
  - link targets.
- Never add a fact, a number, a date or a name that is not in the original. Never drop one.

Follow `STYLE.md` when the answer `scope` includes the guide; otherwise fix only what chaff reports.

## Check it

`sh <base pack>/checks/chaff.sh <the file>` must report no warning or error. If a finding cannot be fixed
without changing what the document says, leave it and say so in the report — do not change the meaning to
satisfy a rule.

If the file cannot be polished at all without changing what it says, restore it from the original, set its
status to `"skipped"` and write a `note` saying why. Otherwise set it to `"done"`.

## Done when

`node <usecase pack>/checks/targets.mjs verify` (with `BLUEPRINT_BASE` and `BLUEPRINT_USECASE` set to the
pack folders from your prompt) passes. Run `verify`, never `progress`: `progress` is the executor's check at
the end of the round and records how many files were finished, so running it yourself makes the real check
fail.
