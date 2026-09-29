# feat: a clicked HTML path opens as the rendered page (#2560)

## Problem

With no Files pane up (no cell enlarged), clicking an `.html` path an agent printed opened
`/api/files/raw`, which answers `.html` as `text/plain` (`common/rawContentType.ts`, on purpose: an
HTML file served from the app's origin could script it). The tab showed the source.

## Change

`fileLinkTarget` (`src/composables/terminalFilePathLinkProvider.ts`) sends an `.html` / `.htm` path to
the page route #2506 added, `/api/files/page/<cwd>/<path>` (`filesPageUrl`):

- served under the presentHtml preview CSP (`sandbox allow-scripts`, no `connect-src`), so the page
  runs at an opaque origin, top-level as much as in the pane's frame;
- its base is authorised exactly as the raw route's (`authorizedServingBase`), so nothing new is
  reachable;
- addressed by path, so an image beside the page loads.

The route names a page by a path UNDER the base, so a path `pathWithinCwd` cannot express keeps the
raw route. In practice the click handler has already rebased a path outside the cell onto its parent
directory, so this is a guard, not a branch users reach.

Unchanged: the raw route's `text/plain` for `.html`; the pane taking the click first while a cell is
enlarged.

## Docs

The routing table lives in three places (header of `terminalFilePathLinkProvider.ts`): README
"Clicking a file path", both `features.md` guides, `docs/terminal-notes.md`. The README paragraph on
what the pane takes was also stale since #2506 (it said the pane declines images/HTML).
