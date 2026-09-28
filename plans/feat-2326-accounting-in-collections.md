# feat: Accounting's entry moves onto the Collections screen (#2326)

Part of the #2311 menu cleanup, at the user's request: Accounting leaves the toolbar and becomes
the first control on the Collections screen's top row, ahead of the pinned favourites.

## Changes

- `AppToolbar.vue`: no Accounting button. The Collections door stays lit while the accounting view
  is open, since that view is now reached from behind it.
- `CollectionsBrowseOverlay.vue`: an icon button (`account_balance`, tip and label "Accounting")
  first on the top row, always present, opening `/accounting`.

## Deliberate divergence from MulmoClaude

MulmoClaude keeps Accounting as a launcher peer of Wiki / Collections / Feeds
(`src/components/PluginLauncher.vue`). This host moves it; a comment at the button says so.

## Docs

The guides' toolbar table and feature list say where Accounting is now. The GitHub guide's
"sits between Accounting and Wiki" was fixed when main (with #2325, which rewrote the same
paragraph) was merged into this branch.
