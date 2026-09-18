// Where a dragged cockpit row would land, from the pointer and the row under it (#2126).
//
// Split out of TerminalGrid.vue because it is the whole rule of the gesture and the only part of
// it a test can reach without a real drag: jsdom has no DragEvent, and a row's geometry there is
// all zeros. The component reads a DOMRect and calls these two; everything else it does with a
// drag is bookkeeping.

// Which half of the hovered row the pointer is in. The row's lower half means the dragged row goes
// AFTER it — the halves are what makes every gap between two rows reachable, since a gap's two
// sides belong to two different rows.
export const dropsAfterRow = (clientY: number, rowTop: number, rowHeight: number): boolean => clientY - rowTop > rowHeight / 2;

// The cell the dragged one would land IN FRONT OF, which is how moveCellBefore names a destination:
// the hovered row itself for the upper half, the row below it for the lower half. `null` is past
// the last row — a real destination on a list that does not end in a launch cell, and one
// canMoveCellBefore refuses on a list that does.
export const dropBeforeUid = (uids: readonly number[], hoveredIndex: number, after: boolean): number | null => uids[hoveredIndex + (after ? 1 : 0)] ?? null;
