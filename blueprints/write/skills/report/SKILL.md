---
name: blueprint-write-report
description: "Report what was written, what was checked, and what could not be."
---

# Report

Write `.blueprint/write-report.md` for the person, in their language and in plain words:

- `## 書いたもの` / `## What was written` — every part's file, in reading order, with one line on what it
  covers. The check looks for each file's path.
- `## 確かめたこと` / `## What was checked` — every part raises no chaff finding under the style; how many
  quotations were checked against their sources; every key point of the brief is covered, and where.
- `## 確かめきれなかったこと` / `## Not checked` — facts stated without a source; open questions from the
  brief that are still open; anything in `STYLE.md` you were unsure how to apply; any rule that seemed wrong
  for this document.

Then tell the person where the document is.
