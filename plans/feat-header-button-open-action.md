# feat: add open and action header buttons from Settings (#2622, step 2)

After #2680 (shell / input buttons), the add form in Settings → Header buttons and chips also builds
the other two kinds:

- **open** — what it opens is chosen from the loader's own targets: a URL, a folder in the Files view,
  a folder in the file manager, a new shell in a folder, a view of the app (diff / PRs / wiki /
  collections / accounting), this branch's PR, or a file picker. The last two take no value; a view
  is chosen from a list.
- **action** — one of the named operations (`CELL_ACTIONS` + `APP_ACTIONS`), listed by the same labels
  the keyboard-shortcut list uses. An old name (`restart`) is written as the current one.

Rules stay in `common/headerButtonEntries.ts` (`buttonFromDraft` → `payloadFor` / `openTarget`), so
the server builds exactly what the loader (`sanitizeOpen`, `headerActionName`) accepts.
`VIEW_TARGETS` moved from `server/config/config-schema.ts` to `common/viewTargets.ts` so Settings
offers the same list.

The form's per-kind fields are `ButtonPayloadFields.vue`. The list row now says what an open or
action button does.

Still left in #2622: folders, and editing an existing entry.

## Verification

- Specs: each open target and action both ways (unknown target / action / view, empty value), the
  route writing what the loader reads, the editor's fields per kind, the rows' detail.
- Real server + browser (demo HOME, a Claude cell): an action button (`pane-files`) and an open
  button (`view: wiki`) were added from Settings, appeared on the open cell without a reload, and the
  action button opened the Files pane.
