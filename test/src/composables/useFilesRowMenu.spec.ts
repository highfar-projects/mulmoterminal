import { describe, it, expect } from "vitest";
import { menuPosition } from "../../../src/composables/useFilesRowMenu";
import type { FilesRowAction } from "../../../src/components/filesRowActions";

// The part of the row menu that is pure, and the part a component test cannot see: where the panel
// lands. It matters because the pointer can be at the bottom-right corner of the screen, and a menu
// placed there opens off-screen with no way to reach its items.
//
// This is what survived the differential harness that proved the lift out of FilesPane.vue: the
// generator (a grid of openings that includes the corners and points far outside the viewport) and
// the property (the panel stays inside). Written with no magic numbers — the bounds are read from
// the function itself, so a change to the margin is not a test failure but a change to the CLAMP is.
// Only the COUNT matters here — the clamp reads `actions.length` and nothing else — so these are
// real `insert-relative` entries rather than a cast-shaped stand-in.
const actions = (n: number): FilesRowAction[] =>
  Array.from({ length: n }, (_, i) => ({ id: "insert-relative", label: `a${i}`, icon: "content_paste", text: `a${i}` }));

describe("menuPosition", () => {
  const FAR = 1_000_000;
  const three = actions(3);
  const min = menuPosition(three, -FAR, -FAR);
  const max = menuPosition(three, FAR, FAR);

  it("keeps the panel inside the viewport from any opening point", () => {
    for (const x of [-FAR, -1, 0, 1, 200, 640, 1023, 1024, FAR]) {
      for (const y of [-FAR, -1, 0, 1, 200, 384, 767, 768, FAR]) {
        const at = menuPosition(three, x, y);
        expect(at.left).toBeGreaterThanOrEqual(min.left);
        expect(at.left).toBeLessThanOrEqual(max.left);
        expect(at.top).toBeGreaterThanOrEqual(min.top);
        expect(at.top).toBeLessThanOrEqual(max.top);
      }
    }
  });

  it("opens exactly where the pointer is, while the pointer leaves room", () => {
    const inside = { x: Math.round((min.left + max.left) / 2), y: Math.round((min.top + max.top) / 2) };
    expect(menuPosition(three, inside.x, inside.y)).toEqual({ left: inside.x, top: inside.y });
  });

  // The height enters the top clamp, so a taller menu has to start higher. This is the half of the
  // formula a component test never exercises: every menu the pane builds has three or four rows.
  it("starts a longer menu higher up, because it is taller", () => {
    expect(menuPosition(actions(9), FAR, FAR).top).toBeLessThan(menuPosition(actions(2), FAR, FAR).top);
    expect(menuPosition(actions(9), FAR, FAR).left).toBe(menuPosition(actions(2), FAR, FAR).left); // width does not depend on it
  });
});
