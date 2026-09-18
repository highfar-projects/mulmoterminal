// Where a dragged cockpit row would land, from the pointer and the rows on screen (#2126).
//
// Split out of TerminalGrid.vue because it is the whole rule of the gesture and the only part of
// it a test can reach without a real drag: jsdom has no DragEvent, and a row's geometry there is
// all zeros. The component reads the rows' boxes and calls these two; everything else it does with
// a drag is bookkeeping.

// Which half of the hovered row the pointer is in. The row's lower half means the dragged row goes
// AFTER it — the halves are what makes every gap between two rows reachable, since a gap's two
// sides belong to two different rows.
const dropsAfterRow = (clientY: number, rowTop: number, rowHeight: number): boolean => clientY - rowTop > rowHeight / 2;

/** A row's on-screen box, as much of it as the drop rule reads. */
export interface RowBox {
  top: number;
  height: number;
}

// The row the pointer names and which half of it, over a list whose rows are in `rows` order.
// Every pixel of the list names a slot: above the first row, and the 9px channels between rows,
// read as the upper half of the row BELOW — `findIndex` lands on the first row the pointer has not
// passed the bottom of, and the midpoint test then comes out negative for anything above its top.
export function dropSlot(rows: readonly RowBox[], clientY: number): { index: number; after: boolean } | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => clientY < row.top + row.height);
  const row = rows[index];
  if (index < 0 || !row) return { index: rows.length - 1, after: true }; // below every row: the end
  return { index, after: dropsAfterRow(clientY, row.top, row.height) };
}

// The cell the dragged one would land IN FRONT OF, which is how moveCellBefore names a destination:
// the hovered row itself for the upper half, the row below it for the lower half. `null` is past
// the last row — a real destination on a list that does not end in a launch cell, and one
// canDropCellBefore refuses on a list that does.
export const dropBeforeUid = (uids: readonly number[], hoveredIndex: number, after: boolean): number | null => uids[hoveredIndex + (after ? 1 : 0)] ?? null;

// Is the pointer inside the roster's own box? The one thing that tells a `dragleave` naming no
// element apart from another: the RELEASE reports none and happens where the pointer is, while
// leaving the window reports none and does not. A missing box answers no, since a roster that is
// not on screen is not one the pointer is over.
export function pointerInside(box: DOMRect | undefined, clientX: number, clientY: number): boolean {
  if (!box) return false;
  return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
}
