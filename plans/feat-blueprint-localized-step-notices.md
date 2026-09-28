# Blueprints: the executor's own step notes in the person's language

Issue: #2379 (follows #2373)

## Why

When the executor stops a step for a reason of its own, it records an English sentence as the step's check output, and the run view shows it under "What the check reported" in every UI language. A person meets four: another build is working in the folder, the folder is not trusted, the interview answers could not be written, the session ended early.

## Shape

- `common/blueprint/stepNotice.ts`: the notice as data, and `englishStepNotice`, the English the step keeps as its `output` (the agent reads it in the next prompt).
- The `check` event and `lastCheck` carry an optional `notice`; the next check replaces `lastCheck` whole, so a notice never outlives its check. Stored runs without one still parse.
- The executor records its four stops through `recordNotice`.
- The run view words a notice through `blueprints.notices.*` (the text names the Try again button by its label in each locale) and shows a pack's check output as it is.

## Out of scope

- The round-limit hold reason (`reason`, not a check), the protocol refusals of `applyEvent`, and a pack's own check output.

## Verification

- Every notice worded in every locale with its values; a pack's output shown as it is.
- State keeps the notice with its check, drops it with the next, and reads an old record.
- The executor records each of the four notices; the run view shows the translated text.
- Each decision inverted in turn goes red.
