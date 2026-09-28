# Blueprints: a document build's review gate says what to read

Issue: #2431

## Why

Every document pack stops for a person before some steps (the `review` gate). The run view showed what an app build shows there:

- a gate text telling the person to read the specification;
- a specification panel saying there is none;
- a conversation that revises `spec.md`.

Document builds write no specification. The person was pointed at something that does not exist, and told nothing about what to read. This was seen on a waiting itinerary build on the test server.

## Shape

- The specification panel, and the line giving the spec file's path, are shown only when there is a specification, a conversation about one, or a revision under way. App builds are unchanged, because their first step writes the spec before any review gate.
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

- A pack spec requires every review-gated step of a document pack to name what to read.

A build created before this keeps the steps it was created with, so its gates show no list. Only new builds do.

## Verification

- `reads`: defaults to none; contained paths are accepted; traversal, absolute, empty, spaces and drive paths are refused.
- Packs: every document review gate names reads.
- Run view: the gate lists the reads, and each opens in the Files view with the build's folder as base; there is no list when a step names none.
- Specification panel: shown with a spec, a conversation or a revision; hidden and empty otherwise.
- Each decision inverted in turn goes red.
- On the test server, the waiting itinerary build's gate now shows the reworded text and no specification panel.
