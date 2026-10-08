# Blueprints: a document build's review gate says what to read

Issue: #2431

## Why

Every document pack stops for a person before some steps (the `review` gate). The run view showed what an app build shows there:

- a gate text telling the person to read the specification;
- a specification panel saying there is none;
- a conversation that revises `spec.md`.

Document builds write no specification. The person was pointed at something that does not exist, and told nothing about what to read. This was seen on a waiting itinerary build on the test server.

## Shape

- The specification panel, and the line giving the spec file's path, are hidden in one case only. That case is a document gate: one that names what to read, where neither the run record nor the panel's own read shows a spec, a conversation or a revision. Everything else shows it:
  - an app gate (it names no reads), which keeps the panel even when the spec is missing, so the conversation that can rewrite it stays within reach;
  - a revision under way;
  - a conversation in the run record or in the panel's read;
  - a spec that was read.

  A failed read never hides a conversation or its error, and a stale run record never hides a fresh one. The rule was inverted to this form after three rounds had each found one more state the earlier "show when …" rule missed.
- The review gate text no longer names the specification (5 locales).
- A step may list `reads`: paths inside the build's folder. `.blueprint` is allowed; `..`, absolute paths and odd characters are not. At a gate, the run view lists them, each opening in the Files view. Named for the document packs:

  | pack | step | reads |
  |---|---|---|
  | style | rules | the sources |
  | style | counter | `STYLE.md`, `chaff.yaml` |
  | write | outline | the brief |
  | write | draft | the outline |
  | polish | polish | the list |
  | review | propose | the findings |
  | ask | keep | the replies |
  | verify | report | the facts |

- The contract is stated on the `reads` field: naming any says the gate is not a review of the spec.
- Pack specs pin both sides: every review-gated step of a document pack names what to read, and every review-gated step of an app pack (bases and non-document usecases) names none.

A build created before this keeps the steps it was created with, so its gates show no list. Only new builds do.

## Verification

- `reads`: defaults to none; contained paths are accepted; traversal, absolute, empty, spaces and drive paths are refused.
- Packs: every document review gate names reads.
- Run view: the gate lists the reads, and each opens in the Files view with the build's folder as base; there is no list when a step names none.
- Specification panel: at an app gate it is always shown, a missing spec included. At a document gate it is shown with a spec, with a conversation (from the run record even when the read failed, or from the read even when the record is stale), and with a revision even when the read failed. It is hidden and empty otherwise. Each of the five conditions goes red when dropped.
- Each decision inverted in turn goes red.
- On the test server, the waiting itinerary build's gate now shows the reworded text and no specification panel.

The icons on the new buttons (and on the earlier changed-files, next-steps and picker buttons) are `aria-hidden`, so a screen reader hears the file name, not the icon's name.
