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

## What the drag shows: the list, re-ordered live

The first build drew an insertion bar between rows. It is gone. The roster's chrome already spends
its border, its ring and its background on status and on "you are here" (`rosterAlertClasses.ts`),
so a fourth mark competed with three that were already saying something — and it could not answer
"where does that leave the others" at all.

Instead the rows themselves move, animated, to the order the drop would leave them in:

- `reorderBefore` (below) is applied to `listRows` while a drag is in flight, so the preview is
  computed by the same function the reducer applies. The preview cannot describe a move the drop
  does not make.
- `<TransitionGroup>` with a `move-class` FLIPs the re-order. No `tag`, so it renders a fragment and
  the rows stay direct children of the aside's flex column. The duration rides in on a CSS variable
  (`--roster-move-ms`) because Tailwind generates utilities from literal source text, so a
  `duration-[…]` built at runtime would produce no rule — the same reason the zoom's FLIP passes
  `--flip-ms`.

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

Plus `reorderBefore(items, uid, beforeUid)`, the order both of them produce, over any keyed list —
that is what lets the preview and the commit be the same function.

**Two guards, not one**, because the preview and the commit ask different questions:

- `canDropCellBefore` — may the cell OCCUPY this slot? Both cells known, not the cell itself, and
  never past a trailing launch cell (it keeps the last slot, because "+ Terminal"/cancel act on it).
  Dragging the launcher itself is allowed, as `canMoveCell(launchUid, -1)` already allows.
- `canMoveCellBefore` — and would that CHANGE anything? The extra refusal is "in front of your own
  successor", which is where you already are.

They had to separate once the preview existed: hovering the slot a row started in is a legal thing
to do mid-drag — the rows have to show it back in place — it just commits nothing.

## What running it in a browser changed

Three things, none of which the unit tests could have said, and all three found by driving Chrome:

**1. `drop` does not always arrive, so `dragend` commits too.** A drop only fires on the element the
browser calls the current target, re-hit-tested as the drag moves. Re-ordering the list puts a
DIFFERENT row under a pointer that has not moved, so the row that accepted the last `dragover` is
not the one released on: the browser leaves it (a `dragleave` naming no `relatedTarget`) and ends
with **no `drop` at all**. The preview snapped back and the reorder was lost — a gesture that
visibly worked and did nothing, with nothing erroring and every unit test green. `dragend` is the
event that always arrives, so whichever of the two comes first commits; the first clears the state
the second reads.

That makes Escape the one ending that must commit nothing, and `dragend` reports a cancel exactly as
it reports a drop the browser declined — same type, same `dropEffect: "none"`. So the key is watched
for the duration of the drag.

Making the rows `pointer-events-none`, so the aside stays the drop target, was tried first and is
worse: the drag SOURCE loses hit-testing mid-gesture, which stalled the drag outright.

**2. The slot is measured from `offsetTop`, not from `getBoundingClientRect`.** The FLIP moves a row
with a TRANSFORM, which the rect reports and the offsets do not. Measured with the rect, a pointer
held still during the 180ms slide was tested against boxes that were still moving — the roster
showed one order and the drop committed another. The offsets are the settled layout, which is where
the rows are going and what the drop will mean. (The aside carries `relative` so it is the rows'
offsetParent.)

**3. A `dragleave` naming no element is not a leave.** The browser reports `relatedTarget` as null
for the release itself; reading that as "gone" wipes the target a beat before the commit reads it.

One property fell out of the uid destination and is worth naming: **re-answering the same pointer
position cannot change the answer**, because the destination is an identity ("in front of that row")
rather than a position. A re-order under a still pointer leaves it either in the same row's same
half or inside the dragged row, whose own slot says nothing. Position-based destinations are what
bounce; this one does not. The component still short-circuits the repeat, but as a throttle —
`offsetTop` forces layout and Chrome fires dragover continuously.

## The gesture

- A `drag_indicator` handle in the row header's slot (`CockpitHeader`), beside the ⋮, rendered only
  when `reorderable`. `draggable` is on the HANDLE, not the row: the row body's click swaps which
  terminal is enlarged, and `@click.stop` on the handle keeps a plain click on it from doing that —
  the same separation #707 made for the ⋮.
- Every row is a drop zone. Which half of the row the pointer is in decides whether the dragged row
  lands before it or after it (`rosterDrag.ts`, pure).
- A slot the cell may not occupy, and the row's own slot, both LEAVE THE PREVIEW ALONE rather than
  collapsing it — a refusal that snapped the list back would make holding the pointer over the
  forbidden gap past the trailing launcher flicker the whole roster.

## Files

- `src/components/gridTabs.ts` — `canMoveCellBefore` / `moveCellBefore`.
- `src/components/rosterDrag.ts` (new, pure) — which row and half the pointer names over a list of
  boxes, and which uid that puts the drop in front of.
- `src/components/TerminalGrid.vue` — the handle, the drop zone, the indicator, `move-before`.
- `src/components/GridView.vue` — `move-before` into `moveCellBefore`.
- `docs/guide/{en,ja}/basics.md` — one sentence in the cockpit section.

## Verified by running it

A second server on a throwaway `HOME` (port 34599, `dist/` built from this branch), three shell
cells, one enlarged, driven through Chrome with Playwright:

- the handles appear on every row and the drag starts from them;
- mid-drag the roster already shows the order the drop will leave, animated into place;
- dropping the last row in front of the first re-orders the roster and leaves the enlarged terminal
  where it was;
- no uncaught console errors.

`GridView.vue` sat one line under `max-lines`, so the three lines this adds needed room. It came
from a real duplication rather than from shortening a comment: `orderedCells.value.map(c => c.uid)`
was written out in two places, and is now the `orderUids` computed both read.

## Out of scope (from the issue)

auto / priority DnD; dragging the tiles in the tiled grid; writing `orderPriority`.
