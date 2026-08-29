import { describe, it, expect } from "vitest";
import {
  LAYOUTS,
  isLayout,
  dims,
  trackStyle,
  layoutForCount,
  stackLayout,
  stackGrid,
  MIN_STACK_CARD_WIDTH_PX,
  MIN_STACK_VISIBLE_PX,
} from "../../../src/components/gridLayout.js";

describe("gridLayout", () => {
  it("exposes the layouts smallest→largest", () => {
    expect(LAYOUTS).toEqual(["1", "2", "2x2", "3x2", "4x2", "3x3"]);
  });

  it("isLayout accepts known layouts and rejects everything else", () => {
    expect(isLayout("1")).toBe(true);
    expect(isLayout("2")).toBe(true);
    expect(isLayout("3x3")).toBe(true);
    expect(isLayout("5x5")).toBe(false);
    expect(isLayout(null)).toBe(false);
    expect(isLayout(42)).toBe(false);
  });

  it("dims returns cols/rows/cellCount", () => {
    expect(dims("1")).toEqual({ cols: 1, rows: 1, cellCount: 1 });
    expect(dims("2")).toEqual({ cols: 2, rows: 1, cellCount: 2 });
    expect(dims("2x2")).toEqual({ cols: 2, rows: 2, cellCount: 4 });
    expect(dims("3x2")).toEqual({ cols: 3, rows: 2, cellCount: 6 });
    expect(dims("4x2")).toEqual({ cols: 4, rows: 2, cellCount: 8 });
    expect(dims("3x3")).toEqual({ cols: 3, rows: 3, cellCount: 9 });
  });

  it("layoutForCount picks the smallest layout that fits", () => {
    expect(layoutForCount(1)).toBe("1");
    expect(layoutForCount(2)).toBe("2");
    expect(layoutForCount(3)).toBe("2x2");
    expect(layoutForCount(4)).toBe("2x2");
    expect(layoutForCount(5)).toBe("3x2");
    expect(layoutForCount(6)).toBe("3x2");
    expect(layoutForCount(7)).toBe("4x2");
    expect(layoutForCount(8)).toBe("4x2");
    expect(layoutForCount(9)).toBe("3x3");
  });

  it("layoutForCount clamps out-of-range counts to 1..9", () => {
    expect(layoutForCount(0)).toBe("1");
    expect(layoutForCount(-3)).toBe("1");
    expect(layoutForCount(12)).toBe("3x3");
  });

  it("trackStyle: one equal track per cell", () => {
    expect(trackStyle("3x2")).toEqual({
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "1fr 1fr",
      gap: "6px",
    });
    expect(trackStyle("1")).toEqual({
      gridTemplateColumns: "1fr",
      gridTemplateRows: "1fr",
      gap: "6px",
    });
    expect(trackStyle("3x3")).toEqual({
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "1fr 1fr 1fr",
      gap: "6px",
    });
  });

  it("trackStyle: covers every layout", () => {
    LAYOUTS.forEach((layout) => {
      const { cols, rows } = dims(layout);
      const style = trackStyle(layout);
      expect(style.gridTemplateColumns.split(" ")).toHaveLength(cols);
      expect(style.gridTemplateRows.split(" ")).toHaveLength(rows);
    });
  });
});

describe("stackLayout", () => {
  it("falls back to the floor width before the container has been measured", () => {
    expect(stackLayout(0, 4)).toEqual({ cardWidthPx: MIN_STACK_CARD_WIDTH_PX, gapPx: 6 });
    expect(stackLayout(-1, 4)).toEqual({ cardWidthPx: MIN_STACK_CARD_WIDTH_PX, gapPx: 6 });
  });

  it("a single cell just fills the container, floor or not", () => {
    expect(stackLayout(1000, 1)).toEqual({ cardWidthPx: 1000, gapPx: 6 });
    // Narrower than the floor: there is nothing to overlap against, so it still just fills it.
    expect(stackLayout(200, 1)).toEqual({ cardWidthPx: 200, gapPx: 6 });
  });

  it("ample width: an even share with plain spacing, no overlap — the '3 or 4 columns' case", () => {
    // (1212 - 6*2) / 3 = 400, exactly the floor: still the ample branch (>=), not overlap.
    expect(stackLayout(1212, 3)).toEqual({ cardWidthPx: 400, gapPx: 6 });
    expect(stackLayout(1300, 3)).toEqual({ cardWidthPx: (1300 - 12) / 3, gapPx: 6 });
  });

  it("tight width: cards hold the floor and the surplus becomes negative-margin overlap", () => {
    // excess = 400*3 - 900 = 300; overlap = 300/2 = 150 per gap; total consumed:
    // 400*3 + (-150)*2 = 900, exactly the container.
    expect(stackLayout(900, 3)).toEqual({ cardWidthPx: 400, gapPx: -150 });
  });

  it("overlap is uncapped: even a pathologically tight row always fits exactly, no scrollbar needed", () => {
    // The whole point of the arrangement (raised after shipping: a scrollbar showed up) — every
    // tile still fits inside the container exactly, however thin the overlap makes each one.
    const { cardWidthPx, gapPx } = stackLayout(1000, 20);
    expect(cardWidthPx).toBe(MIN_STACK_CARD_WIDTH_PX);
    const consumedWidth = cardWidthPx * 20 + gapPx * 19;
    expect(consumedWidth).toBeCloseTo(1000);
  });

  it("a custom minWidthPx is honored", () => {
    expect(stackLayout(1000, 4, 200)).toEqual({ cardWidthPx: (1000 - 18) / 4, gapPx: 6 });
  });
});

describe("stackGrid (wraps to another row before overlap gets illegible)", () => {
  // Cross-checked by hand against stackLayout's own numbers: at 1200px/400px-floor, 6 per row is
  // the last one whose visible strip (160px) still clears MIN_STACK_VISIBLE_PX (140px) — a 7th
  // would drop it to 133.33px.
  it("packs as many per row as stay legible, then reports that as cols", () => {
    const g = stackGrid(1200, 9);
    expect(g).toEqual({ cols: 6, ...stackLayout(1200, 6) });
  });

  // A narrower window fits fewer per row — this is the "3 or 4 columns" the feature was asked
  // for, arrived at from the visibility floor rather than a hardcoded column count.
  it("a narrower container packs fewer per row", () => {
    expect(stackGrid(900, 9).cols).toBe(4);
  });

  it("never exceeds the actual cell count", () => {
    expect(stackGrid(1200, 3).cols).toBe(3);
    expect(stackGrid(1200, 1).cols).toBe(1);
  });

  it("every packed row size actually clears the visibility floor", () => {
    const g = stackGrid(1200, 9);
    const visible = g.cardWidthPx + Math.min(g.gapPx, 0);
    expect(visible).toBeGreaterThanOrEqual(MIN_STACK_VISIBLE_PX);
  });

  it("falls back to 1 column before the container has been measured", () => {
    expect(stackGrid(0, 9)).toEqual({ cols: 1, ...stackLayout(0, 1) });
  });
});
