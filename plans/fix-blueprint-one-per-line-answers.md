# Blueprints: one-per-line answers get a multi-line field

Issue: #2422

## Why

Several questions ask for a list, one item per line (documents, targets, questions, model texts, points, sources), and the checks split those answers by lines. Every text question was a single-line input, which cannot take a newline. A browser also strips the newlines from a value it is given. So:

- a person could not enter a second item;
- an example's list collapsed to one line as soon as the field was touched.

Reproduced in a browser: the 尋ねる example's three questions went out as one line after one keystroke.

## Shape

- A question may say `lines: true` (text only; any other kind is a hearing problem). The form renders it as a multi-line field, which keeps the newlines both ways.
- Every question in the shipped packs whose label says 「1 行に 1 つ」 carries it. A pack spec pins that, so a new such question cannot be written without it.

## Verification

- Hearing: `lines` defaults to false; on a select or a number it is refused.
- Field: a list question is a multi-line field showing every line, and hands back what is typed with its newlines; an ordinary text question stays a single-line input.
- Packs: every 「1 行に 1 つ」 question says `lines`.
- Each decision inverted in turn goes red.
- In a browser on the test server, the same steps that collapsed the list now show three lines and send four after one is added with Enter.
