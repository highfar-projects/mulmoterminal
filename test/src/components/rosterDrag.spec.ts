import { describe, it, expect } from "vitest";
import { dropBeforeUid, dropsAfterRow } from "../../../src/components/rosterDrag";

describe("dropsAfterRow", () => {
  it("splits the row at its midpoint", () => {
    expect(dropsAfterRow(110, 100, 40)).toBe(false); // 10px in, upper half
    expect(dropsAfterRow(130, 100, 40)).toBe(true); // 30px in, lower half
  });

  it("puts the exact midpoint in the upper half, so one pixel belongs to one side only", () => {
    expect(dropsAfterRow(120, 100, 40)).toBe(false);
    expect(dropsAfterRow(121, 100, 40)).toBe(true);
  });

  it("reads a row scrolled above the viewport, where the top is negative", () => {
    expect(dropsAfterRow(-30, -40, 40)).toBe(false);
    expect(dropsAfterRow(-10, -40, 40)).toBe(true);
  });

  it("never says 'after' for a row with no height (jsdom, or a row being removed)", () => {
    expect(dropsAfterRow(0, 0, 0)).toBe(false);
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
