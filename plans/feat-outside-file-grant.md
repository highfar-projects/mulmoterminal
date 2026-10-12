# Open a clicked file outside the cell in a tab, through a one-file grant (#3024)

## Problem

A clicked path outside the cell is opened against its own directory. For Markdown, JSON, tables and
source that works (the browse routes take any base), but an image, PDF, video, audio file or HTML page
goes through the raw or page route, which only serves the workspace and live session directories — so
the tab shows `{"error":"cwd is not an active session directory"}` (403).

## Decisions (with the user)

- Types: video, images (SVG included), PDF, audio, **and HTML pages**.
- A grant lives until the server restarts (memory only; a cap of 1000 bounds memory, not time).

## Change

- `common/fileGrant.ts`: `grantKind(name)` — `page` for HTML, `raw` for image / video / audio / PDF.
- `server/backends/files/sendRawFile.ts`: the raw route's serving code, moved verbatim so a grant is
  served the same way. Proved by running the old and new route side by side over generated requests.
- `server/backends/files/fileGrants.ts`: `POST /api/files/grant {path}` (absolute or `~`; 404 missing,
  400 not absolute / not a file, 415 a type a tab does not show) → `/api/files/granted/<token>/<name>`;
  the GET serves only the granted name.
- Client: `grantedTab.ts` opens a blank tab synchronously (popup blockers), cuts `opener`, asks for the
  grant, then navigates the tab or writes why not. The link provider sends an outside path of a granted
  type there.
- Room under the line caps: the terminal path menu's strings move with the new ones into
  `src/i18n/fileLinks/`, and `registerFilePathLinks` into its own module.

## Out of scope

- The right pane's root, and the full-screen Files view on a base that is not served.
- Relative resources of a granted HTML page (by the one-file rule).
