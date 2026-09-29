# feat: insert the editor's selection at the cell's prompt as `@path#Lx-y` (#2575)

## Problem

The Files pane sits beside the agent that wrote the file, but telling the agent "these lines" meant
typing the path and line numbers by hand.

## Change

- `src/components/selectionReference.ts` (pure): `@<path>#L<from>-<to> ` (`#L<n>` for one line, the path
  alone with no selection). Relative only when the terminal's directory is the pane's root — the rule
  `filesRowActions` already applies to "Insert relative path" — absolute otherwise.
- `CmEditor.selectedLines()`: the whole lines the selection covers. Ranges on adjoining lines are one
  run (a column selection, bare cursors on blank lines included); separate ranges fall back to the
  main one. A range ending at the start of a line does not take that line.
- Unsaved edits are saved in place first (`savedInPlace`, shared with the Preview toggle) — the agent
  reads the file on disk; a save that loses to another writer leaves the conflict banner and inserts
  nothing.
- `FilesPane`: an **@** header button, shown where there is a terminal to insert into (the grid pane,
  not the full-screen view), and `insertSelection()` for the new keymap action. Both emit the existing
  `insert-text`, which types at the enlarged cell's prompt without sending and focuses the terminal.
- Keymap action `files-insert-selection` (no default binding): needs the pane up, like the tab keys;
  labels and tips in five locales; config guide, keys skill.

The form is Claude Code's IDE integration's; any other agent reads it as text.
