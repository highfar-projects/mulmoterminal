# test #2130 — run the shipped `keymap` samples through the real validator

## Why

The release checklist in `CLAUDE.md` already says *"any config sample is run through its real
validator"*. Nothing executes it, so it held for as long as someone remembered — and in #2127 it
did not: the guide was shipping `"next-attention": "Cmd+Shift+A"` in both languages, the exact
spelling the section below it describes as dead on macOS. CodeRabbit caught it, from **outside the
diff**, which is the one place a reviewer is least likely to look.

Nothing is broken right now — every sample validates clean today. This is a net for the next one.

## What it checks

Every fenced `json` block under `docs/guide/**` and in a bundled `SKILL.md` that contains a
`keymap`, parsed and passed to `validateKeymap`. **Warnings fail as well as errors**: the whole
point is `"Cmd+Shift+A"`, which is a warning.

Three deliberate calls, each flagged for review rather than buried:

- **Dated release pages are IN.** `CLAUDE.md` says never to edit an old dated page to match new
  behaviour — but that is about prose describing what a release did. A `json` block is not a
  description, it is a thing a reader copies, and the day a release ships its page is exactly what
  they copy from. Every dated sample passes today, so including them costs nothing now. If a future
  rule tightens and an old sample trips, that is a decision to make then — fix the sample or
  exclude the page — not a reason to weaken the check; the spec says so where it is made.
- **A block containing `…` is a SKETCH, and skipped.** The skill's
  `{ "keymap": { "send": [ … ] } }` illustrates the partial-merge trap and was never valid JSON.
  A rule beats an allowlist here: an allowlist grows one entry at a time until it is the check.
- **Files are enumerated from the directory, not typed out.** A hand-typed list silently drops a
  page — and the check written from the same list agrees with it, which is how the duplicate in
  `nav_order` survived until review.

## Not vacuous

A doc-scanning spec fails silently the day its extractor stops matching: zero blocks found, zero
failures, green forever. Three guards, because this is the whole risk:

1. The extractor and the validation are a **pure function in `test/support/`** with its own spec
   that feeds it markdown in **both directions** — a clean sample and a `"Cmd+Shift+P"` one — so
   the reporting path itself is pinned rather than assumed.
2. The docs spec asserts the number of samples it actually checked against a floor **held in a
   constant**, so a regex that matches nothing is a failure rather than a pass.
3. It asserts that each of the four LIVING guide pages (`config.md` and `basics.md`, both
   languages) yields at least one sample. A floor alone would still pass if one page dropped out
   and another grew.

## Scope

`keymap` only. Themes, header buttons and launchers are copied out of the guide too and have their
own validators — a second issue, not this one. Widening here would mean four validators and a spec
nobody reads.
