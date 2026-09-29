# fix: the Markdown Preview's wire hears only the document it asked for (#2515)

The host (the Files pane) heard the Markdown Preview frame by its `contentWindow`. That trusts a
FRAME, not a document: a Markdown file is not sanitised, and one can navigate its own frame
(`<meta http-equiv="refresh">`, `<area href>`, SVG `xlink:href`) to a page that then posts `open`
(open a file in a tab) and `navigate` (`window.open`) from the same window. The Markdown document
loads ahead of its Preview, so this needed no click: measured on main, opening such a file in a new
tab opened another file and a browser popup by itself.

## Change

- The pane mints a token (`crypto.randomUUID()`) whenever it builds a Markdown Preview src, and puts
  it in the URL (`MD_PREVIEW_TOKEN_PARAM = "wire"`).
- The md route passes it, if it is well-formed (`isPreviewToken`: 16-64 of `[A-Za-z0-9_-]`), to the
  nonce'd reporter, which stamps it on every message; anything else is written as `null`.
- `mdPreviewFrameMessage` reads the token; `useMdPreviewScroll` drops a message whose token is not the
  pane's current one (and all of them while the pane has none).
- A page the frame was navigated to never had the token. The per-kind iframe key (#2269) stays.

## Verification

- Specs on every layer (parse, stamping and escaping in the reporter, the route, the host's rejection
  of another / no / malformed token, the pane's messages carrying the token from the iframe URL).
- Break-verified: each guard removed turns a spec red.
- Real browser, main vs this branch, with a `meta refresh` forger posting `open` / `navigate` every
  200 ms: main opened a file tab and a popup with no click; this branch opened neither, while a real
  relative link in the Preview still opened its tab.
