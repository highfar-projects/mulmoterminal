# fix: full width carried to the cell the zoom moves to (#3219)

## Problem

`paneExpanded` (the right pane taking the row) is decided in `setRightPane` only. Moving the zoom
moves the pane through the re-root watcher instead, which left the flag as it was: a conversation
taken full width on one cell made the next cell's Tools cover its terminal. Reproduced in the app
on `main` and in a spec.

## Decision (asked)

A zoom move and a reload start the pane split, whatever it shows, a conversation included. Full
width stays something asked for on the cell it is on (opening the conversation there, or closing
the pane over it, or the expand button).

## Fix

The re-root watcher clears `paneExpanded` when it moves the pane to another cell. Not a watch on
`paneUid`: `setRightPane` itself moves `paneUid` and decides full width in the same call, and a
watcher running after it would undo that.

## Tests

`test/src/components/rightPaneStackGrid.spec.ts`: full width not carried by a zoom move (red
without the fix); a conversation reached by a zoom move, and one restored by a reload, start split.
