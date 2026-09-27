---
name: blueprint-review-report
description: "Report what was found, what was checked, and what could not be checked."
---

# Report

Write `.blueprint/review-report.md` for the person, in their language and in plain words:

- `## 見つけたこと` / `## Findings` — every finding by its `id`, most severe first: what is wrong, where
  (the address), and the proposal when there is one. The check looks for each `id`.
- `## 確かめたこと` / `## What was checked` — every quotation was found in the document by `chaff cite`;
  every structure problem chaff reported was addressed or dismissed with a reason; the originals are
  unchanged; with proposals, each corrected copy's name and that it has no more structure problems than the
  original.
- `## 確かめきれなかったこと` / `## Not checked` — what a machine cannot confirm: that the reading is
  complete, that a proposal is what the parties mean, anything that depends on law or documents outside
  these files. Recommend a professional's review where the stakes call for it.
