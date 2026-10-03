# Blueprint form: multi-line text fields with example placeholders (#2881)

## Why

The interview's free-text answers were a one-line input at 12px, smaller than the label, and gave no hint
of what to write. Several questions ask for a few sentences.

## Decisions

- **Multi-line by default.** Every `text` question renders as a `<textarea>`, except a collection pick and a
  question marked `short: true` (a name, an id, a year). The answer was already a plain string written to
  `.blueprint/answers.json`, so a newline in it changes no reader; the one check that reads a free-text
  answer (`polish` `avoid`) already splits it into lines.
- **`short` is declared in the hearing, not guessed from the id.** The schema refuses it on anything but a
  single-line text question.
- **`placeholder` is text, not a value.** It is never submitted, so the locale overlay may replace it like
  `label` and `why`.
- **Every text question gets one**, in Japanese (`hearing.json`) and English (`locales/en.json`), written as
  an example answer starting with 例: / e.g.
- Inputs, selects and textareas go to 14px; the label to 14px and the note under it to 12px.
