# A document build's approval screen takes changes and answers

At a document build's review gate the person could only approve or stop. The brief's open questions (who hands over
the pass, how the password is given) had nowhere to be answered, so the document was written with blanks and the
report said the questions went unanswered. An app build's gate already had a conversation that revises the spec.

- The same conversation now shows at a document gate: the spec column and its file line go, and the chat keeps its
  own words ("Send changes or answers"). It sends through the same route and executor `say` as an app build.
- `specRevisionPrompt` takes the gate's `reads`. When there are any, the session revises those files instead of a
  spec: it writes an answered open question where the file keeps what is known and removes the question, keeps each
  file's sections so the step that wrote it still accepts it, and touches neither the documents nor anything else.
  An app build's gate, which names nothing to read, is pointed at its spec as before.

Checked on a real write build: answers sent from the screen moved into the brief's facts, the answered questions left
its open questions, the agent raised the one contradiction it found as a new question, and the revised brief still
passes the brief step's check.
