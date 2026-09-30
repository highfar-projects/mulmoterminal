# feat: open a directory's config in Files from Settings (#2624, remainder)

The rest of #2624 after #2659 (save applies and reports) and #2670 (`backgroundImage` in the
writable schema): a way from **Settings → Directory settings** to the file itself.

## What changes

- `DirConfigPreview.vue`: beside `.mulmoterminal.json` and `.mulmoterminal.local.json`, an
  **Open in Files** button; where a directory has neither (nor `repo.json`), **Create
  .mulmoterminal.json and open it**.
- `dirConfigOpen.ts`: `ensureDirConfigFile` writes `{}\n` through the existing conditional write
  (`PUT /api/files/browse/write`, `baseVersion: null` = "I expect no file"). A 409 means the file is
  there already, which is treated as success — it is opened, not overwritten.
- `SettingsModal` closes itself and calls `filesGotoFile(dir, name)`.

## Decisions

- **The full-screen Files view, not the pane.** The pane can only root at the enlarged cell's
  directory; Settings lists directories that may have no cell open. The `/files` view takes any
  directory in its query, and `open.files` buttons already use it.
- **Create an empty object, not a template.** `{}` sets nothing, so creating it changes no behaviour;
  the editor's schema completion (#2670) supplies the keys.
- The create uses the same write path the editor saves through, so it is contained and backed up
  the same way; no new server route.

## Verification

- Specs: both open buttons emit the right file; create sends the conditional write and then opens;
  a 409 still opens; a refused write shows an error and opens nothing.
- Real server + browser (demo HOME): Directory settings → shop (no config) → create → `{}` on disk,
  Settings closed, `/files?cwd=…&path=.mulmoterminal.json` showing the file. No console errors.
