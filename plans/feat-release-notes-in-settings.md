# feat: past release notes in Settings (#2717)

The What's new dialog (#2661) shows a release's dated guide once, after an upgrade; closed, it was
only on the web. **Settings → Release notes** now lists every version up to the running one (newest
first, by the page's title) and shows the chosen one in place, rendered as the dialog renders it.

## Decisions

- **Two read-only GETs**, not the dialog's `POST /api/whats-new`, which records the running version as
  seen as it answers — reading an old release must not count as having been shown the new one.
  - `GET /api/whats-new/versions?lang=` → `{ version, releases: [{ version, title }] }`
  - `GET /api/whats-new/version/:version?lang=` → one page, or 404.
- The version parameter never reaches a path unless it is one of the listed versions.
- Versions newer than the running one are not offered (a guide page for an unreleased version can be
  on disk in a checkout).
- Language as the dialog: Japanese UI → the Japanese page, otherwise English, English as a fallback.
- A new tab in the Help group (`releaseNotes`); strings in `src/i18n/releaseNotes/`.
- A later choice wins over an earlier answer that arrives after it.

## Verification

- Specs: the routes on a temp guide dir (order, language, fallback, unreleased / unknown / traversal
  refused, nothing recorded as seen), the parsers, the section (newest first, switching, a late answer
  ignored, failure and empty states).
- Real server + browser (demo HOME, Japanese UI): 94 versions listed by Japanese title, 7.3.0 shown
  first, choosing another shows its page; no console errors.

Seen while checking, not changed here: a Japanese guide line wrapped mid-sentence renders a space at
the wrap, in this section and in the dialog alike.
