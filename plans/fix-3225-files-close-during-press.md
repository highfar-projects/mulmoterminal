# fix: a Files close lost to a press that was saving (#3225)

## Problem

The files pane's close button saves and then emits `close`. A pane pressed meanwhile
(`toggleRightPane`) also saves first. When the press's save finished first, its pane took the slot
and unmounted the files pane, so the `close` emitted afterwards was dropped by Vue: Tools showed as
pressed, but Files stayed in the stack beneath it. Reproduced in a spec.

## Decision (asked)

Both actions are done, whichever save finishes first: the pressed pane shows and Files leaves the
stack.

## Fix

- `FilesPane` emits `closing` with the save (a promise) before awaiting it, while it is still
  mounted. `close` is unchanged, so `FilesOverlay` and the grid's normal path are untouched.
- The grid awaits that save itself. If it landed and Files is no longer on screen in that cell, it
  takes Files out of the stack (`withPaneRemoved`, pure). When Files is still on screen it does
  nothing, and the pane's own `close` closes it as before.
- Files opened again on that cell while the save was pending is a newer request. `setRightPane`
  counts openings of Files per cell, and the late close leaves the stack alone when the count moved.

## Tests

- `rightPaneStack.spec.ts`: `withPaneRemoved`.
- `rightPaneStackGrid.spec.ts`: a press then a close, in both save orders; an ordinary close still
  goes through the pane's own `close` (red if the grid finishes it while Files is on screen, which
  skips filing the tree); a Files opened again before the close's save lands stays. The stub's close
  button mirrors `FilesPane`'s.
- `FilesPane.spec.ts`: `closing` carries the save result, `true` when saved and `false` when not.
