# feat: a blueprint question can carry choices and a recommendation (#2850)

## Problem

A step's agent asks a person through `QUESTION='…' <askCommand>`, and all that travels is one
Markdown string. The decisions a refactor build actually stops for (#2233: fix / narrow / leave a
type, file a suspected bug, change or keep behaviour, accept a costed no) are each "read the
evidence, pick one of a few options". Today the person has to read prose and type the option back.

## Shape

- **Evidence stays in the question.** It is already rendered as Markdown; a second channel for it
  would be a second place to look. The skills say what evidence to put there.
- **Choices travel in `$CHOICES`, one per line, `label: what it costs and risks`.** Prose, not
  JSON, for the same reason the question is: the agent writes it inside single quotes in a shell
  line, and node does the JSON encoding. The label is everything before the first `:` (or `：`).
- **`$RECOMMEND` names one label.** A recommendation naming no choice is refused, so the agent
  learns of the typo instead of the person seeing no recommendation.
- Both optional. A question without them behaves exactly as before.

Parsing is a pure function in `common/blueprint/askChoices.ts`; the route turns its refusal into a
400 that `curl --fail-with-body` shows the agent.

## State

`StepState.choices` (`{ label, description?, recommended? }[]`) is set by `ask`, replaced by a
second `ask`, and dropped by `answer` and `repeat` — it lives exactly as long as `question`.

Picking a choice sends the existing `answer` event with the label as the answer, so the answer
history, the next step's prompt and the run log need no change. Typing a free answer stays possible.

## UI

`BlueprintRunView.vue`: when the awaiting step has choices, a button per choice (label, its
description, a "recommended" mark) above the free-text field.

## Skills

`blueprints/refactor/skills/tranche` and `survey` say when to use choices and what the four kinds of
decision look like.
