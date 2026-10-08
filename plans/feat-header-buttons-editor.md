# feat: edit the global header buttons in Settings (#2622, buttons first step)

Chips shipped in #2672. This is the buttons' first step, by the user's choice: the **top-level**
global list, with the two simplest kinds addable.

## What changes

- `common/headerButtonEntries.ts` — `buttonFromDraft` (label, optional icon and `when`, a `shell`
  command or `input` text; the id is derived from the label and free across the whole list, folder
  children included), `entriesWithAdded` / `entriesWithout` / `entriesMoved`, `MAX_HEADER_BUTTONS`
  (which `MAX_BUTTONS` now reads).
- `POST /api/config/buttons/{add,remove,move,reset}` (`server/config/header-button-routes.ts`) under
  the config lock against the file. Entries are named by id (unique by the loader), so a changed
  list cannot redirect a remove or move to another entry.
- `HeaderButtonsEditor.vue` in Settings → Header buttons and chips; `headerButtonsConfig.ts` keeps
  the rows (what each entry is and does, not the entry itself).
- The header-refetch counter moved from the chips module to `headerConfigRevision.ts`, shared.

## Decisions

- **Unconfigured is the built-in set** (the PR button); the first change starts from it, and reset
  removes the key.
- **Only `shell` and `input` can be added.** Folders, `open` and `action` buttons are listed,
  removable and movable; writing them stays with JSON / the header skill.
- **An entry with its own `order` is not moved**: it is placed by that number wherever it sits, so a
  move would change nothing on screen (the route refuses with `ordered`).
- No on/off switch exists in the config, so "hide" is remove, or a `when` condition.
- No editing of an existing entry yet; remove and add again.

## Verification

- Specs: the rules both ways, the routes against a temp HOME, the rows composable, the editor.
- Real server + browser (demo HOME, a Claude cell): adding "Hello build" kept the PR button, wrote
  both to the file, and the new button appeared in the open cell without a reload; reset removed the
  key. No console errors.
