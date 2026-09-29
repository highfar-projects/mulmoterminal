# feat: header buttons can bring back the cell controls #2311 moved into menus (#2611)

#2311 moved the cell's own `+`, the Files button and the pane toggles into the path / History /
Tools menus. `buttons` could re-create the `open.*` ones, but `run: "action"` knew only `restart`,
so none of those could come back as a button (#2603 asked for the `+`).

## Change

- `common/headerActions.ts` — the action list, shared by the config loader (server) and the
  dispatcher (client): `restart`, `new-here`, `timeline`, `talk`, and the panes `files`, `prompts`,
  `transcript`, `tools`, `canvas`, `collections`.
- `useCellRestart` becomes `useCellAction`: the per-cell handler now receives the action.
- `TerminalCell` answers `restart` / `timeline` / `talk` itself and passes panes (`press-pane`) and
  `new-here` up. `TerminalGrid` toggles a pane on the enlarged cell and, on a tile, enlarges and
  opens it (the `open-files` gesture). `GridView` answers `new-here` with `toggleLaunchPanel(uid)`,
  the same call the `terminal-new-here` shortcut makes.
- A declined action (no Claude session for `timeline`, no one to `talk` to, a terminal outside the
  grid) shows a hint in the cell, as `restart` already did.

## Out of scope

- No default button is added; the header stays as #2311 left it.
- Toolbar entries are not header config.
