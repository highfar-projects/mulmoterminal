# feat: colour code blocks in the Markdown Preview (#2579)

Decided on the issue: no new library — the editor's own grammars.

- `server/files/codeHighlight.ts` (pure): `highlightedCode(code, lang)` parses with the
  `@codemirror/lang-*` grammar for the fence's language and emits `<span class="tok-*">` through
  `@lezer/highlight`'s `classHighlighter`. Unknown language or a block past `MAX_HIGHLIGHT_CHARS` →
  null, and marked renders it as before. `@lezer/highlight` was already installed through every
  `lang-*` package; it is now declared, deduplicated to one copy (two copies would not share the
  tag objects the grammars style with, and nothing would be coloured).
- **A parse is budgeted.** A block built to be pathological for its grammar can take minutes and
  gigabytes on the server's one thread (review measured an out-of-memory abort for a 150k-char
  `xml` block). The parse is stepped with `startParse().advance()` and given up after
  `BLOCK_BUDGET_MS`, with `DOCUMENT_BUDGET_MS` for all of a document's fences (`fenceColourer`);
  a block over budget, or one the grammar or highlighter throws on (stack overflow on deep nesting),
  is shown plain.
- `files-browse.ts`: marked's `code` renderer uses it, so both the Preview and the new-tab document
  are coloured.
- `renderedDoc.ts`: a light and a dark token palette; the system theme picks one, and the app's
  theme (`themeStyle`) picks by its background.

## The copy button was dropped

The issue also asked for a copy button. It was built and taken out after review: the Preview renders
a `.md` nobody sanitised, and although it runs no script of its own, its markup and stylesheet are
unrestricted. Review showed a file can make the text a button copies differ from what the reader
sees — hide part of a fence with CSS (`.tok-comment{display:none}`), replace it with generated
content, clip it, or lay a decoy over it — and no check inside the document can see a decoy. Next to
a terminal, the paste target is a shell. So the copy is left to a follow-up issue that can decide
the design (for example the host showing the text before it copies).
