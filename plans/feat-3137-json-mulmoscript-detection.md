# feat: a .json is a MulmoScript only with a root $mulmocast; other JSON previews indented (#3137)

## Why

Every `.json` was offered the Canvas (MulmoScript) view, decided on the extension alone, and an
ordinary JSON file opened there answered `File is not a valid MulmoScript`.

## What changes

- **Canvas**: in the Files pane, a `.json` has the Canvas view (the button, a remembered Canvas
  mode) only when its root object holds `$mulmocast`, a key mulmocast's schema requires. It is judged
  on the text as read from / saved to disk (what the view reads), when the open path or the disk
  version changes, so a keystroke does not reparse the file. The plugin still validates the script. The tree row
  menu's "Open in the Canvas" stays path-gated: it is offered before the file is read.
- **Preview**: `.json` gets a Preview kind of its own, `json`, drawn by the existing
  `/api/files/browse/json` route (already used for a clicked `.json` in a terminal), now themed in
  the app's colours like the table preview. Unparseable JSON is shown as it is, as that route did.

## Out of scope

- The terminal link provider's `.json` route and `storyWirePath` (path-only) are unchanged; the content
  check sits in the pane, which has the text.
- Agent-driven `presentMulmoScript` is unaffected (it names the file on purpose).

## Shape

- `src/composables/mulmoScriptText.ts` (pure): `isMulmoScriptText`, `canvasNeedsMulmoScript`.
- `useFilesCanvasMode.ts`: `canvasGates` (content gate + plugin gate); `active` and `openable` use it.
- `filePreviewKind.ts` / `filesPreviewSrc.ts`: the `json` kind and its src; `renderedDoc.ts` /
  `files-browse.ts`: `jsonHtmlDoc` takes the theme.

## Tests

- `mulmoScriptText.spec.ts`; `useFilesCanvasMode.spec.ts` (ordinary JSON: no button, a remembered mode
  not drawn; re-judged on save); `filesPaneCanvas.spec.ts`; `filePreviewKind`, `filesPreviewSrc`,
  `renderedDoc` and a new `files-browse-json.spec.ts` for the themed route.
