# polish can work through the findings adopt shelved (#2780)

adopt shelves today's findings in `.chaff-baseline.json`, so chaff reports only new ones. Polish ran chaff the same
way, saw nothing, and ended with 「整える文書はありません」 — the shelved backlog could not be worked through.

- polish's interview asks 「棚上げした指摘も直しますか」 (新しい指摘だけ, the default / 棚上げした指摘も直す). It is asked
  only with the folder's style, and only where the folder has `.chaff-baseline.json` (#2744's `needsPath`), so
  everywhere else it is settled and never seen.
- `kind.mjs`: `shelvedArgs(answers)` gives `--show-baseline` only for the folder's style with that answer;
  `measureArgs()` is the kind's genre plus that, and `targets.mjs` measures every file with it. `feedback.mjs` keeps
  `kindArgs()` — a draft report to chaff is about one rule and line, not the baseline.
- The survey, polish and report skills add `--show-baseline` / say the counts include the shelved findings.
- The baseline file is not rewritten: entries are matched by content, so a fixed sentence matches none, and chaff's
  CLI has no prune.

A real run on a copy of the adopt example's folder: the form asked the question there and not in a folder without a
baseline; polish split both shelved long sentences without changing a fact, and chaff with `--show-baseline` then
reported nothing.
