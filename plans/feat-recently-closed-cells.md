# Reopen recently closed cells (#2800)

Closing a cell by accident left no trace. Now each close is recorded in the browser and the command
palette offers it back.

## Recording

`GridView.onClose` is the one path every close reaches (a cell's own close button, the
`terminal-close` shortcut, a launcher cell's close). Before the cell is dropped it records
`closedCellOf(cell, title, now)`:

- agent cell -> `{ kind: "session", session, cwd, agent, account, title, closedAt }`
- shell launcher cell -> `{ kind: "shell", cwd, title, closedAt }` (its PTY ends on close, so it comes back fresh)
- command cell, configured launcher (addressed by list position, which may have moved), empty cell -> not recorded

The title is what the roster shows: memo, then the agent's title, then the last prompt, falling back
to the directory name.

Storage: `localStorage["mt-recently-closed"]`, newest first, capped (`RECENTLY_CLOSED_MAX`).
Closing the same thing again moves it up instead of listing it twice. A write re-reads the store
first so another tab's closes are kept. A store that cannot be read or written only costs the list.

## Reopening

Palette rows of kind `reopen` ("Reopen: <title>", directory and time as the detail), searchable by
title and directory and under `>`. Entries whose session the grid has open again are hidden. Picking
one opens a cell beside the acting terminal with the stored session id — the server reattaches a live
PTY or resumes the transcript, the same path a page reload takes — and drops the entry from the list.

## Keymap action `terminal-reopen`

An app action (`common/appActions.ts`), so it works from every screen and from a header button:
`openCellAt` queues the cell for the grid and shows it. It reopens the newest reopenable entry
(`reopenLastClosedCell` in `reopenClosedCell.ts`, shared with the palette row) and declines — keeping
the entry — when there is none or the grid is at its cap. Unbound by default, like every action.

## Not in this change

- Sync across devices: browser storage only, by decision.
