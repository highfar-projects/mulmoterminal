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
  mounted. `close` is unchanged, so `FilesOverlay` is untouched.
- The grid closes Files from `closing` alone and no longer listens to `close`. The pane's own `close`
  can land late (both saves finishing in one tick: it would close whatever is on top by then) or not
  at all (a press or a zoom move unmounted the pane). The grid awaits the save and decides against
  where Files is NOW in the cell it was on: on top, it closes as usual (`setRightPane(null)`); under
  another pane, it is taken out of the stack (`withPaneRemoved`, pure).
- Files opened again on that cell while the save was pending is a newer request. `setRightPane`
  counts openings of Files per cell, and the late close does nothing when the count moved.

## Tests

- `rightPaneStack.spec.ts`: `withPaneRemoved`.
- `rightPaneStackGrid.spec.ts`: a press then a close, with the saves finishing in either order or
  together; the zoom moving away before the close's save lands; a Files opened again meanwhile
  stays; an ordinary close files the tree for next time. The stub's close button mirrors
  `FilesPane`'s, and specs close the files pane by emitting `closing`.
- `FilesPane.spec.ts`: `closing` carries the save result, `true` when saved and `false` when not.
