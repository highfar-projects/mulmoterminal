# fix: deliver the measured width table to a page that loaded before it existed (#3173)

## Problem

The width table (#3174) is measured at boot, unawaited, and served only in `/api/config`. The
browser reads `/api/config` once. `npx mulmoterminal` opens the browser as soon as the server
listens, while the measurement still has a couple of seconds to run, so the tab it opens gets
`terminalWidthTable: null` and counts with Unicode 11 until the user reloads. Found by Codex
cross-review of the merged #3174.

## Decision

- `settledTmuxWidthTable(wait_ms)` in the probe: the table once the running measurement ends, or
  what is known after the wait. Immediate when nothing is being measured (psmux, no tmux).
- `GET /api/config/terminal-widths` answers with it, waiting a bounded time below the browser's
  request timeout.
- The browser asks it once, only when `/api/config` carried no table, and adopts a table that
  arrives. Terminals already open switch through the existing watch on the table ref.
- `/api/config` keeps carrying the table, so a page loaded later needs no second request.

## Not in scope

- Rows already painted with the built-in table stay as painted until tmux repaints them; new output
  and repainted rows count with the measured table.

## Verification

- Probe: a request made while measuring gets the measured table (real tmux); a wait shorter than the
  measurement gives up with what is known; nothing measuring answers at once.
- Route and client loader specs, including malformed and failed answers.
- Each new test was break-verified by removing the change it covers.
