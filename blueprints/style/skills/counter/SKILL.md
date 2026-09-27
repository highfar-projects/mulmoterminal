---
name: blueprint-style-counter
description: "Prove the style bites: write texts that deliberately break the guide and confirm chaff reports them."
---

# Show that the style catches something

A style that no bad text can trip is a style nothing checks. This is the documents' version of breaking
the code to see a test go red.

Write a few short texts in `.blueprint/counter/`, in the same language and kind as the models. Each
breaks the guide on purpose, and each in a different way: a long run-on sentence, the wrong sentence
ending mixed in, a heading the next sentence merely repeats, padding and cushion phrases, a term spelled
against `STYLE.md`. Keep them plausible — the kind of draft a real writer produces on a bad day.

List them in `.blueprint/counter.json`:

```json
[{ "file": "run-on.md", "breaks": "語調と文末: 一文に三つ以上のことを詰めない" }]
```

## Done when

`node "$BLUEPRINT_USECASE/checks/counter.mjs"` passes: chaff reports something in every counter text, and
at least three different rules fire across them. If a text raises nothing, the style does not reach what
it breaks: either that part belongs in STYLE.md only (a machine cannot see it — say so in the report),
or a rule is too loose — go back and decide it again, with its reason.
