# feat: Insert a file path moves into the path menu (#2349)

Decision 6 of the menu / icon cleanup in #2311: the cell's path menu is where every file operation
on a session cell lives, and the default header row 2 keeps only the self-hiding `pr` button.

## Changes

- `TerminalCell.vue`: the path menu gains **Insert a file path** as its first item. It calls
  `pickFileInto` from `useHeaderAction.ts` (now exported), the same helper a user's own
  `open.pickFile` button dispatches to, so the two cannot drift. A failure is shown on this cell's
  banner through `Terminal.vue`'s exposed `showHint`.
- `server/config/header-config.ts`: `pick-file` leaves `DEFAULT_BUTTONS`. It stays a valid button;
  listing it in `buttons` brings the paperclip back.
- `src/components/dropHint.ts`: the failed-drop hint now has three answers — the header button when
  one is configured (one click), the path menu when the terminal has one (a session cell that is not
  a filmstrip thumbnail, passed as `pathMenuPicker`), otherwise "type or paste the path". Pure
  function, own spec.
- Docs (en/ja basics, config, header, features), the `mulmoterminal-header` skill and README describe
  the one-button default set and the picker's new place.

## Out of scope

- The cell header `+` (decision 5) — its own PR.
- GitHub icons in the path menu (Octicons) — its own PR.
- Command cells and launchers have no path menu; nothing changes for them.
