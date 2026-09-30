# What's new after an upgrade (#2647)

## Goal

When the server starts on a newer version than the one the user last saw, the browser shows a
**What's new** dialog, in Japanese or English, with each version's dated setup guide. The user
should learn which new features to try, what looks different on screen, and what changed that
they cannot see.

## Decisions

- **Where**: the browser UI, not the CLI. `yarn dev` bypasses the launcher, so the decision lives
  on the server and the UI asks it.
- **Content**: the dated setup guides `docs/guide/{en,ja}/v<version>.md` that every release already
  writes. They are added to the npm `files` list (the markdown only, not the images).
- **Language**: `ja` UI reads the `ja` page; every other UI language reads `en`. A missing `ja` page
  falls back to `en`.
- **Range**: every version with `lastSeen < v <= current`, newest first, capped by a named constant.
  When capped, the dialog links to the full changelog.
- **No state yet** (a fresh install, or the first run with this feature): show nothing and record
  the running version, so the next upgrade has a version to count from.
- **Marking seen**: answering is showing. `POST /api/whats-new` records the running version under a
  cross-process lock in the same step as it reads the old one, so of several tabs or browsers
  opening at once only the first gets the guides (the user's choice over showing it in every tab).
  A POST because it writes, and only state-changing methods pass the same-origin guard.
- **Screenshots**: loaded from the published guide site. `renderMarkdownProse` turns remote images
  into links (#2115) because agent-written prose can point anywhere; the dialog passes one trusted
  origin, the guide site, and only that origin is let through. Agent prose is unchanged.
- **Links**: relative links in a guide (`../images/x.png`, `features.html#a`) are rewritten to
  absolute URLs on the guide site, since the dialog is not on that site.

## Pieces

- `common/whatsNew.ts` — pure: version compare, which versions to show, wire type + parser,
  guide language for a UI locale.
- `server/whatsNew/guidePage.ts` — pure: front matter stripped, title read, duplicate H1 removed,
  relative links rewritten.
- `server/whatsNew/state.ts` — `~/.mulmoterminal/whats-new.json` (`{ lastSeenVersion }`), read
  tolerant of a missing or corrupt file, claimed under `withConfigLock`, written atomically.
- `server/whatsNew/routes.ts` — `POST /api/whats-new` with `{ lang }`.
- `src/components/WhatsNewDialog.vue` + `src/composables/useWhatsNew.ts`, mounted in `App.vue`.
- i18n keys in all five locales.

## Guide pages from now on

Dated guides are what the dialog shows, so from the release that ships this they must:

- be written for someone who has never read the docs: where to click, what each word means, what
  they will see; no PR-speak;
- cover every user-facing entry of that release's changelog;
- sort it under three fixed headings, present even when empty:
  `## 新機能` / `## 画面の変化` / `## 見えない変化` and
  `## New features` / `## What looks different` / `## Under the hood`.

A spec checks the headings and that every PR the changelog lists for the version is mentioned in
both language pages, for versions newer than the last page written before this rule. Older pages
are snapshots and are not rewritten. The rule is written into CLAUDE.md's release section.

## Out of scope

- A CLI notice at `npx mulmoterminal` start.
- Reopening the dialog later.
