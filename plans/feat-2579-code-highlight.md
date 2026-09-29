# feat: colour and copy code blocks in the Markdown Preview (#2579)

Decided on the issue: no new library — the editor's own grammars.

- `server/files/codeHighlight.ts` (pure): `highlightedCode(code, lang)` parses with the
  `@codemirror/lang-*` grammar for the fence's language and emits `<span class="tok-*">` through
  `@lezer/highlight`'s `classHighlighter`. Unknown language or a block past `MAX_HIGHLIGHT_CHARS` →
  null, and marked renders it as before. `@lezer/highlight` was already installed through every
  `lang-*` package; it is now declared, deduplicated to one copy (two copies would not share the
  tag objects the grammars style with, and nothing would be coloured).
- `files-browse.ts`: marked's `code` renderer uses it, so both the Preview and the new-tab document
  are coloured.
- `renderedDoc.ts`: a light and a dark token palette; the system theme picks one, and the app's
  theme (`themeStyle`) picks by its background.
- Copy: the Preview document has no origin to be given the clipboard, so its reporter adds a button
  to each `pre > code` once the host sends the words for it (`copyLabels` on the `ready` answer —
  the server does not know the app's language), and a click posts `{ kind: "copy", text, block }`.
  The host (`useMdPreviewScroll`) writes the clipboard and answers `{ copied, ok }`; the button says
  "Copied" or that it failed. The new-tab document runs no script and gets no button.
