import { describe, it, expect } from "vitest";
import { dropBeforeUid, dropSlot, pointerInside, type PointerBox, type RowBox } from "../../../src/components/rosterDrag";

// Three 40px rows with the roster's 9px channel between them.
const rows: RowBox[] = [
  { top: 100, height: 40 },
  { top: 149, height: 40 },
  { top: 198, height: 40 },
];

describe("dropSlot", () => {
  it("splits a row at its midpoint", () => {
    expect(dropSlot(rows, 110)).toEqual({ index: 0, after: false });
    expect(dropSlot(rows, 130)).toEqual({ index: 0, after: true });
  });

  it("puts the exact midpoint in the upper half, so one pixel belongs to one side only", () => {
    expect(dropSlot(rows, 120)).toEqual({ index: 0, after: false });
    expect(dropSlot(rows, 121)).toEqual({ index: 0, after: true });
  });

  it("reads the channel between two rows as the upper half of the row below", () => {
    expect(dropSlot(rows, 145)).toEqual({ index: 1, after: false });
  });

  it("reads anything above the list as the upper half of the first row", () => {
    expect(dropSlot(rows, 0)).toEqual({ index: 0, after: false });
    expect(dropSlot(rows, -50)).toEqual({ index: 0, after: false });
  });

  it("reads anything below the list as past the last row", () => {
    expect(dropSlot(rows, 240)).toEqual({ index: 2, after: true });
    expect(dropSlot(rows, 9999)).toEqual({ index: 2, after: true });
  });

  it("reads a row scrolled above the viewport, where the top is negative", () => {
    expect(dropSlot([{ top: -40, height: 40 }], -30)).toEqual({ index: 0, after: false });
    expect(dropSlot([{ top: -40, height: 40 }], -10)).toEqual({ index: 0, after: true });
  });

  it("never says 'after' for a row with no height (jsdom, or a row being removed)", () => {
    expect(dropSlot([{ top: 0, height: 0 }], 0)).toEqual({ index: 0, after: true });
    expect(dropSlot([{ top: 0, height: 0 }], -1)).toEqual({ index: 0, after: false });
  });

  it("has no answer for an empty list", () => {
    expect(dropSlot([], 10)).toBeNull();
  });
});

describe("dropBeforeUid", () => {
  const uids = [7, 8, 9];

  it("names the hovered row for its upper half and the next one for its lower half", () => {
    expect(dropBeforeUid(uids, 0, false)).toBe(7);
    expect(dropBeforeUid(uids, 0, true)).toBe(8);
    expect(dropBeforeUid(uids, 1, false)).toBe(8);
    expect(dropBeforeUid(uids, 1, true)).toBe(9);
  });

  it("returns null past the last row — the end of the list", () => {
    expect(dropBeforeUid(uids, 2, true)).toBeNull();
  });

  it("returns null rather than throwing on an index the list does not have", () => {
    expect(dropBeforeUid(uids, 9, false)).toBeNull();
    expect(dropBeforeUid([], 0, false)).toBeNull();
  });

  it("does not assume a uid equals its index", () => {
    expect(dropBeforeUid([4, 0, 2], 1, true)).toBe(2);
  });
});

describe("pointerInside", () => {
  const box: PointerBox = { left: 10, right: 210, top: 50, bottom: 650 };

  it("accepts a pointer within the box, edges included", () => {
    expect(pointerInside(box, 100, 300)).toBe(true);
    expect(pointerInside(box, 10, 50)).toBe(true);
    expect(pointerInside(box, 210, 650)).toBe(true);
  });

  it("rejects a pointer past any one edge", () => {
    expect(pointerInside(box, 9, 300)).toBe(false);
    expect(pointerInside(box, 211, 300)).toBe(false);
    expect(pointerInside(box, 100, 49)).toBe(false);
    expect(pointerInside(box, 100, 651)).toBe(false);
  });

  // Leaving the viewport is the case this rule exists for, and it reports coordinates outside it.
  it("rejects the negative coordinates a viewport exit reports", () => {
    expect(pointerInside(box, 100, -40)).toBe(false);
    expect(pointerInside(box, -1, 300)).toBe(false);
  });

  it("answers no when there is no box at all", () => {
    expect(pointerInside(undefined, 100, 300)).toBe(false);
  });
});
