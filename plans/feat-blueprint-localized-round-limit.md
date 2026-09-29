# Blueprints: the round-limit stop in the person's language

Issue: #2392 (follows #2379)

## Why

A repeating step that runs its maximum number of rounds with work left stops for a person, and the reason it records is shown in English in every UI language.

## Shape

- `round-limit` joins the step notices (`common/blueprint/stepNotice.ts`), with the round count; its English stays the step's `reason`.
- The `hold` event carries the notice; `applyEvent` sets `reasonNotice` from a hold and drops it on every other event, so it cannot outlive the stop.
- The run view's stop line (`stopReasonText`) words a notice in the person's language, and shows a person's own rejection reason as they wrote it.

## Verification

- State: a hold keeps its notice; the next event drops it; a hold without one has none.
- The executor's round-limit hold carries the notice; the run view shows the translated text, and a person's reason unchanged.
- Each decision inverted in turn goes red.
