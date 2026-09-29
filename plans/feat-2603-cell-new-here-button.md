# feat: a default + on the terminal's second header row (#2603)

#2353 removed the cell header `+`, which opened the launch panel on that cell's directory. What
was left for the mouse was the path menu's *New terminal here*, which starts a plain shell and
cannot pick the agent. #2611 added `action: "new-here"` for a configured button; #2603 asked for a
default entry point.

## Change

- `TerminalCell` row 2 (`header-actions`), beside the code-block copy button: an `add` button that
  emits `new-here`, which the grid already answers with `toggleLaunchPanel(uid)` (#2611).
- Row 2, not row 1: #2353's objection was a create button beside close.
- Tooltip `tips.cell.newHere` in all five locales.

## Out of scope

- Command and launcher cells (`CellShell`) have one header row, where the `+` would sit beside
  close again; they keep the path menu and the shortcut.
