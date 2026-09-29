# feat: a relative link in the Preview opens in a new tab of the pane (#2268)

Before this, a relative link (`./b.md`) in the Markdown preview was followed inside the frame,
whose URL is this server's `/api/files/browse/md` route — so it was a 404.

## Change

- The reporter in the preview document hands every link to another file to the host, as written:
  `{ kind: "open", href }`. External `http(s)` links keep going out as `navigate` (#2259). An
  anchor (`#h`) and any other scheme or host (`mailto:`, `//cdn…`) keep the browser's default.
  The two patterns live in `common/mdPreviewMessage.ts` and are built into the script, so the
  script and its specs read one rule.
- `previewLinkTarget(docPath, href)` (pure) resolves the href against the document: query and
  fragment dropped, escapes decoded, `.` / `..` walked, a leading `/` meaning the pane's root.
  A climb past the root is `outside`; a folder, an anchor or a scheme is `none`.
- The pane opens a `file` target in a new tab (or goes to the tab it has), in Preview when it is
  Markdown, since that is where the reader was. `outside` is reported in the pane's alert line
  rather than doing nothing.

## Not in this change

- The plain (non-embedded) document the same route serves has no reporter, so a relative link in
  it is still followed to a 404; this change is about the preview inside the pane.
- A fragment on another file (`b.md#usage`) opens the file but does not scroll to the heading.
