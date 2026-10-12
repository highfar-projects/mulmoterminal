# feat: maths in the full-screen preview, typeset on the server (#3017)

## Decision (user's)

The full-screen `/files` Markdown preview showed `$…$` / `$$…$$` as code, a trade
`docs/file-surfaces.md` recorded as deliberate. The user chose to typeset it on the server.

## Shape

- `server/files/previewMath.ts`: the markdown plugin's own `mathExtension` tokenizers (same delimiter
  rules as the Canvas), with a renderer that typesets to SVG through `mathjax-full` (TeX → SVG,
  `fontCache: "none"`, `AssistiveMmlHandler` for a MathML copy). Loaded on the first document with a
  `$`, built once per process (a MathJax-global handler list).
- `files-browse.ts mdRender`: uses it for both the embedded and the plain document, and adds
  `MATH_STYLE` (visually hidden MathML copy, display maths on its own line).
- `mathjax-full` becomes a direct dependency (it was only transitive).

## Safety

The plugin sanitises its SVG with DOMPurify, which needs a DOM. Leaving packages out was the first
attempt and review showed it is not enough (`\mmlToken` is in `base`; `\color`, `\bbox`, `\enclose`,
`\unicode`, `\tag` and error titles all carry author text into attributes). So the output is
filtered by what is PERMITTED: `keepMathAttribute` (`server/files/mathAttributes.ts`) keeps an
attribute only when its name is one MathJax writes and its value has the shape MathJax gives it;
`href`, `id`, `title`, `fontfamily` and handlers have no entry. Elements are permitted the same way
(`keepMathElement`): SVG `<title>`, which MathJax fills with unescaped error text, is dropped with
its contents (review round 3). A parse5 test (`previewMathParsed.spec.ts`) parses the output and
checks what the parser builds. `html` and `action` are still left out
(`action` throws without DOM events). A fuzz test of the attribute-writing commands, in both modes,
checks no `url(`, `javascript` or `position:fixed` survives; disabling the filter turns 28 cases red.
The sandbox and CSP are unchanged.
