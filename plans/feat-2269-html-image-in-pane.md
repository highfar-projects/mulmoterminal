# feat: HTML and images in the Files pane's tabs (#2269)

What an agent draws — a PNG chart, an SVG, an HTML report — used to leave the grid for a browser
tab. It now shows in the pane.

## What each kind does

- **HTML**: text, edited as it was, with a **Preview** like Markdown's — the page itself.
- **SVG**: text, with a Preview that draws it.
- **PNG / JPEG / GIF / WebP**: never read as text — only their version, so a picture over the edit
  cap (where the text route answers 413) still shows, and the external-change check does not
  rebuild it each tick. The panel that said "not text" shows the picture, keeping "Open in OS".
- A path to any of these clicked in terminal output goes to the pane when it is up
  (`isPaneViewable`); an HTML page or an SVG comes up in its Preview.
- The Markdown preview's message wire listens only while a Markdown document is in the frame: an
  HTML page runs its own scripts, and could otherwise ask the host to open a tab or a file.

The kind is decided from the name (`filePreviewKind`, `isRasterImage`), asked of the raw route's
content-type table, rather than stored on the tab as the issue sketched: a tab's file cannot change
kind without changing name, and a stored field would be one more thing to keep in step.

## Serving

Showing bytes is not reading text, so it takes the raw route's base (`authorizedServingBase`: the
workspace or a live session's directory), not the browse routes' any-base:

- a picture and an SVG come from `/api/files/raw`;
- an HTML page from the new `/api/files/page/<cwd>/<path>`, by PATH so relative links resolve beside
  it. Same base rule, same containment; the page under presentHtml's CSP; anything else under it is
  redirected to the raw route. The URL shape lives in `common/filesPage.ts`, used by both ends.

`docs/file-surfaces.md` records this.

## Look

The Markdown preview is drawn in the app's colours; an HTML page or an SVG is not, so its frame is
white — a page with no background expects a browser's white, and its black text was unreadable on
the app's dark ground (found in the browser check).

## Not in this change

- PDF and video still open in a browser tab.
- In the full-screen view on a base that is not a session directory, the picture or page is refused
  (as the raw route always has been there); the text still opens.
