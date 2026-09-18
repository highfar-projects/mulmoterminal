# feat(roster): drag-and-drop reorder in the cockpit roster (manual sort) — #2126

## What it is

The cockpit roster (`data-testid="cockpit"`, shown while a cell is enlarged in list mode) can only
be reordered a step at a time today: the ⋮ menu on each row (#707) and the ◀▶ buttons on a grid
tile both drive `moveCell(uid, ±1)`, a swap with the neighbour. Moving a row across a long list
means pressing the same item repeatedly.

This adds a drag handle to each roster row so a row can be dropped at an arbitrary position.

## Why it does not fight the existing design

The order is one flat `cells[]` that the grid and the roster both read (#720), and only
`sortMode === "manual"` shows the hand-arranged order as-is — `auto` and `priority` recompute it
(`orderCells`). So a hand reorder is only meaningful in manual, which is exactly what the existing
`reorderable` prop already gates the ⋮ menu on. The drag handle rides on the same prop; nothing is
added to the auto/priority paths.

The ⋮ menu and the tiles' ◀▶ stay. This is an additional gesture, not a replacement — and the ⋮
menu remains the keyboard route, which a drag cannot be.

## The state transform

`moveCell(state, uid, dir)` swaps with a neighbour, which cannot express "drop it here". The new
one names the destination by the cell it lands IN FRONT OF:

```ts
canMoveCellBefore(cells, uid, beforeUid: number | null): boolean
moveCellBefore(state, uid, beforeUid: number | null): GridState   // null = the end of the list
```

**Why a uid and not an index.** `TerminalGrid` is handed `displayCells`, not `state.cells`; the two
are the same array while zoomed in manual sort (`cellsToDisplay` returns the whole ordered list and
`orderCells` returns `cells` unchanged for "manual"), but that is an invariant held in two files. A
uid resolves against whichever array the reducer actually holds, so the index spaces cannot drift
apart the way #907 describes for the API surface. `null` for "past the last row" also states the
one case the guard has to refuse, instead of hiding it in an off-by-one.

Guard, mirroring `canMoveCell`:

- unknown `uid`, or an unknown `beforeUid`, is refused;
- the no-op drops are refused (onto yourself, and in front of your immediate successor), so a drag
  that ends where it started leaves the state object identical;
- the trailing launch cell stays last, which here is exactly "`beforeUid === null` is refused while
  the list ends in a launch cell that is not the one being dragged". Dragging the launch cell
  itself is allowed, as `canMoveCell(launchUid, -1)` already allows.

## The gesture

- A `drag_indicator` handle in the row header's slot (`CockpitHeader`), beside the ⋮, rendered only
  when `reorderable`. `draggable` is on the HANDLE, not the row: the row body's click swaps which
  terminal is enlarged, and `@click.stop` on the handle keeps a plain click on it from doing that —
  the same separation #707 made for the ⋮.
- Every row is a drop zone. Which half of the row the pointer is in decides whether the dragged row
  lands before it or after it (`rosterDrag.ts`, pure).
- The insertion point is drawn as a 3px bar **inside** the row's top or bottom edge rather than in
  the 9px gap between rows. Two reasons: the row's `shadow-*` (status ring) and `border` (frame) are
  both spoken for by `rosterAlertClasses.ts`, and a bar inserted into the flex column would shift
  the list under the pointer while dragging. It is `bg-fg`, not the accent blue — running it showed
  the bar vanishing where it matters most, in front of the ENLARGED row, whose frame and ring are
  already 3px of that blue.
- `dragover` only calls `preventDefault()` where `canMoveCellBefore` says yes, so a refused drop
  shows no indicator and the browser shows "no drop" — the trailing-launcher rule is visible in the
  gesture rather than being a silent no-op at the end of it.

## Files

- `src/components/gridTabs.ts` — `canMoveCellBefore` / `moveCellBefore`.
- `src/components/rosterDrag.ts` (new, pure) — which half of a row the pointer is in, and which uid
  that puts the drop in front of.
- `src/components/TerminalGrid.vue` — the handle, the drop zone, the indicator, `move-before`.
- `src/components/GridView.vue` — `move-before` into `moveCellBefore`.
- `docs/guide/{en,ja}/basics.md` — one sentence in the cockpit section.

## Verified by running it

A second server on a throwaway `HOME` (port 34599, `dist/` built from this branch), three shell
cells, one enlarged, driven through Chrome with Playwright:

- the handles appear on every row and the drag starts from them;
- mid-drag, exactly one insertion bar is in the DOM, on the row the drop names;
- dropping the last row in front of the first re-orders the roster and leaves the enlarged terminal
  where it was;
- no uncaught console errors.

`GridView.vue` sat one line under `max-lines`, so the three lines this adds needed room. It came
from a real duplication rather than from shortening a comment: `orderedCells.value.map(c => c.uid)`
was written out in two places, and is now the `orderUids` computed both read.

## Out of scope (from the issue)

auto / priority DnD; dragging the tiles in the tiled grid; writing `orderPriority`.
