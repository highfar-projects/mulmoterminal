# feat: path menu on every cell; drop the row-1 Files button (#2364)

Part of the cell-header cleanup agreed in #2311.

## Changes

- `CellPathMenu.vue` — the path menu, moved out of `TerminalCell.vue` unchanged in behaviour:
  Reveal / Insert a file path / Browse files in the app / New terminal here, and the GitHub
  section when the remote is GitHub. Failures are emitted (`reveal-failed`, `insert-failed`) for
  the host to show where it shows its own; Browse files emits `open-files` for the grid.
- `TerminalCell` uses it on row 2 (as before). `CellShell` (Run command and launcher cells) uses it
  on the path in its single header row; a thumbnail keeps its plain name.
- Insert a file path needs an addressable terminal slot: agent and launcher cells pass
  `cell-<uid>`; a Run command's output terminal has none, so it passes null and the item is left
  out (New terminal here then appends at the end).
- The row-1 Files button (`folder_open`) is removed, with its `toggle-files` chrome event and the
  `filesOpen` prop chain.

## Kept, and why

- The grid still handles a cell's `toggle-files`. Nothing in the header raises it now; six pane
  specs preset a tiled cell with it and re-staging them is its own change (#2368).

## Verification

- Old vs new `TerminalCell` mounted side by side over generated inputs (cwd kind, GitHub or not,
  lookup ok or not, reveal ok or not, each item pressed): rendered DOM (class order and
  whitespace normalised) and every side effect (fetches, window.open, pick target, hint, new
  terminal, emits, banner text) identical. Two deliberate mutations of the new component were
  caught by it. The harness was deleted; the pre-existing TerminalCell path-menu specs stay the
  permanent check.
