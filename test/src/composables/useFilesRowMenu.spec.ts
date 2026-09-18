import { describe, it, expect } from "vitest";
import { menuPosition, MENU_METRICS } from "../../../src/composables/useFilesRowMenu";
import type { FilesRowAction } from "../../../src/components/filesRowActions";

// The part of the row menu that is pure, and the part a component test cannot see: where the panel
// lands. It matters because the pointer can be at the bottom-right corner of the screen, and a menu
// placed there opens off-screen with no way to reach its items.
//
// This is what survived the differential harness that proved the lift out of FilesPane.vue: the
// generator (a grid of openings that includes the corners and points far outside the viewport) and
// the property (the whole panel stays inside).
//
// The bounds are computed from the VIEWPORT and the panel's own metrics — never from menuPosition
// itself. A first version derived its min/max by calling the function at the extremes, which made
// every assertion true by construction: a clamp to any arbitrary interval, or one reading the wrong
// viewport dimension, passed it (Codex on PR #2151).

// Only the COUNT matters here — the clamp reads `actions.length` and nothing else — so these are
// real `insert-relative` entries rather than a cast-shaped stand-in.
const actions = (n: number): FilesRowAction[] =>
  Array.from({ length: n }, (_, i) => ({ id: "insert-relative", label: `a${i}`, icon: "content_paste", text: `a${i}` }));

const heightOf = (count: number): number => count * MENU_METRICS.rowPx + MENU_METRICS.padPx;

const withViewport = (width: number, height: number, body: () => void): void => {
  const [w, h] = [window.innerWidth, window.innerHeight];
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  try {
    body();
  } finally {
    Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: h, configurable: true });
  }
};

const FAR = 1_000_000;

describe("menuPosition", () => {
  it("keeps the whole panel inside the viewport, from any opening point", () => {
    withViewport(1024, 768, () => {
      for (const count of [1, 3, 9]) {
        for (const x of [-FAR, -1, 0, 1, 200, 640, 1023, 1024, FAR]) {
          for (const y of [-FAR, -1, 0, 1, 200, 384, 767, 768, FAR]) {
            const at = menuPosition(actions(count), x, y);
            expect(at.left).toBeGreaterThanOrEqual(MENU_METRICS.marginPx);
            expect(at.left + MENU_METRICS.widthPx).toBeLessThanOrEqual(window.innerWidth - MENU_METRICS.marginPx);
            expect(at.top).toBeGreaterThanOrEqual(MENU_METRICS.marginPx);
            expect(at.top + heightOf(count)).toBeLessThanOrEqual(window.innerHeight - MENU_METRICS.marginPx);
          }
        }
      }
    });
  });

  it("opens exactly where the pointer is, while the pointer leaves room", () => {
    withViewport(1024, 768, () => {
      expect(menuPosition(actions(3), 300, 200)).toEqual({ left: 300, top: 200 });
    });
  });

  // Which dimension each axis reads. Swapping them passes a containment check on a square viewport
  // and fails here, which is why the two viewports are not square.
  it("reads the width for the left edge and the height for the top", () => {
    const three = actions(3);
    const wide = withViewportValue(1600, 400, () => menuPosition(three, FAR, FAR));
    const tall = withViewportValue(400, 1600, () => menuPosition(three, FAR, FAR));
    expect(wide.left).toBe(1600 - MENU_METRICS.widthPx - MENU_METRICS.marginPx);
    expect(wide.top).toBe(400 - heightOf(3) - MENU_METRICS.marginPx);
    expect(tall.left).toBe(400 - MENU_METRICS.widthPx - MENU_METRICS.marginPx);
    expect(tall.top).toBe(1600 - heightOf(3) - MENU_METRICS.marginPx);
  });

  // The height enters the top clamp, so a taller menu has to start higher. This is the half of the
  // formula a component test never exercises: every menu the pane builds has three or four rows.
  it("starts a longer menu higher up, because it is taller", () => {
    withViewport(1024, 768, () => {
      expect(menuPosition(actions(9), FAR, FAR).top).toBeLessThan(menuPosition(actions(2), FAR, FAR).top);
      expect(menuPosition(actions(9), FAR, FAR).left).toBe(menuPosition(actions(2), FAR, FAR).left); // width does not depend on it
    });
  });
});

function withViewportValue<T>(width: number, height: number, body: () => T): T {
  let out!: T;
  withViewport(width, height, () => {
    out = body();
  });
  return out;
}
