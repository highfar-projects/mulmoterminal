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

The plugin sanitises its SVG with DOMPurify, which needs a DOM. The server narrows the input
instead: the TeX `html` package (`\href`, `\class`, `\style`, `\cssId`) is left out, and `require`
/ `autoload` are not among the packages, so it cannot be loaded back. Tests pin every one; putting
the package back turns them red. The sandbox and CSP are unchanged.
