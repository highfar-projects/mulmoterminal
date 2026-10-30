# fix: overlapping re-roots of the right pane (#3218)

## Problem

The watcher in `TerminalGrid.vue` that moves the pane to the enlarged cell awaits the files pane's
save (`flush()`) before it moves anything. A second zoom move during that wait starts a second run.
Whichever finishes last wins, so the pane can end up on a cell that is no longer enlarged:

- two moves whose saves finish out of order: the older run lands last;
- a move and a move straight back: the newer run sees nothing moved and returns at once, and the
  older run then moves the pane away.

When the cell it lands on shows Files too, `rightPane` does not change and nothing re-runs the
watcher, so the pane stays on the wrong cell and root. Reproduced in a spec (not in the app).

## Fix

A run counter. Each run takes a number; after the save it returns unless it is still the latest.
The later `reload()` is left unguarded: it reads the pane's current root, so a stale one only
reloads what is already there, while skipping it could leave a moved pane on the old tree.

## Tests

`test/src/components/rightPaneStackGrid.spec.ts`: both orders above, with every cell showing
Files. Both go red with the guard removed.
