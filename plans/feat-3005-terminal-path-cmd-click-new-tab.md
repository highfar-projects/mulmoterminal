# feat: Cmd/Ctrl+click a terminal path opens it in a new pane tab (#3005)

## Goal

A path clicked in terminal output with Cmd (macOS) or Ctrl held opens in a NEW tab of the Files pane,
keeping the tab in front — the rule the tree already follows (#2461). A plain click still replaces the
front tab.

## Decisions

- **One rule for "new tab"**: `wantsNewTab(event)` (`src/composables/newTabModifier.ts`) is
  `metaKey || ctrlKey`, used by the tree and by the terminal link. On macOS Ctrl+click is a right click,
  so there only Cmd works — as in the tree.
- **The flag travels the existing chain** as a trailing `newTab` argument: link provider `activate(event)`
  → `tryOpenInPane` → `openInFilesPane` → `FilesPaneOpener` (TerminalGrid's `openClickedPath` /
  `showClickedPath`) → `FilesPane.openFile` → `useRequestedOpen.openClicked` / `openAt` → `tabs.open`.
- Unchanged: a file that already has a tab goes to it; at `MAX_TABS` the front tab is replaced
  (`openedInNewTab`); the keyboard stays in the terminal (`openAt(…, focus: false)`); clicks the pane does
  not take fall through to the routes they had.
- Not in scope: a plain terminal click opening a new tab, the full-screen `/files` route, the phone.

## Specs

- link provider (real xterm): Cmd / Ctrl `activate` passes `newTab: true`; a plain one passes `false`.
- `filesPaneOpener.spec.ts`: the flag reaches the registered opener.
- `filesPaneTabs.spec.ts`: `openFile(path, location?, newTab)` adds a tab and keeps the front one, with a
  line too; an already-open file goes to its tab; a plain open replaces.
