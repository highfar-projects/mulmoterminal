# A document build's approval screen takes changes and answers

At a document build's review gate the person could only approve or stop. The brief's open questions (who hands over
the pass, how the password is given) had nowhere to be answered, so the document was written with blanks and the
report said the questions went unanswered. An app build's gate already had a conversation that revises the spec.

- The same conversation now shows at a document gate: the spec column and its file line go, and the chat keeps its
  own words ("Send changes or answers"). It sends through the same route and executor `say` as an app build.
- What it may change is declared per gate: a step's new `revises` (beside `reads`). Most reads are VIEWS a check
  writes from a record (`polish.txt` from `polish.json`, `outline.txt` from `outline.json`); editing a view reaches
  nothing, and the next check overwrites it. So every document gate names its records — `gateRevises.spec.ts` holds
  each one to declare them, each read to be a record or backed by a same-named JSON record its pack's checks use.
- `specRevisionPrompt` tells the session to change the `revises` (answers move out of the open questions; each file
  keeps its shape) and to leave the views alone. A build started before its pack declared `revises` reads them from
  the pack (`declaredRevises`), so it is never left editing the views.
- When the revision ends, the check of the step before the gate runs again: it redraws the views from the changed
  records and says whether they still fit. A failure is added to the conversation (`check-failed`) with the check's
  output, so the person sees it before approving.
- Refusal wording that said "spec" is neutral now.

Not done: a guard that refuses changes outside the declared files (the session is told not to, and the re-check holds
the records it reads).

Checked on a real write build: answers sent at the brief gate moved into the brief's facts; at the outline gate the
session changed `outline.json`, the re-check redrew `outline.txt` with the reordering and additions, and the written
document carried every answer with no blanks left.
