---
name: blueprint-polish-report
description: "Report what was polished, what was checked, and what was left as it was."
---

# Report

Write `.blueprint/polish-report.md` for the person, in their language and in plain words:

- `## 整えたもの` / `## What was polished` — every polished file, with how many findings it had before and
  after, and one line on the kind of change. The check looks for each file's path.
- `## 確かめたこと` / `## What was checked` — for every polished file, the headings, the structure's
  addresses, code blocks and link targets are unchanged, and chaff reports nothing under the style. The
  originals are in `.blueprint/originals/`; in a git repository, `git diff` shows every change.
- `## 直さずに残したもの` / `## Left as it was` — skipped files and why; findings that could not be fixed
  without changing the meaning; files over the agreed number, for another run.
