// A view-only frame moves exactly the field it carries, and a finale is counted rather than
// flagged, so the view reacts to each one even when two arrive at the same level.
import { describe, it, expect } from "vitest";
import { applyViewFrame, type ConnViewState } from "../../../src/composables/connViewFrames";

const view = (): ConnViewState => ({ status: "connected", serverCwd: "/w", inCopyMode: false, heatLevel: 0, heatFinales: 0 });

describe("applyViewFrame", () => {
  it("sets the copy-mode flag from a paneMode frame and nothing else", () => {
    const v = view();
    applyViewFrame(v, { type: "paneMode", inCopyMode: true });
    expect(v).toEqual({ ...view(), inCopyMode: true });
  });

  it("sets the heat level from a heat frame and nothing else", () => {
    const v = view();
    applyViewFrame(v, { type: "heat", level: 3, finale: false });
    expect(v).toEqual({ ...view(), heatLevel: 3 });
  });

  it("counts each finale", () => {
    const v = view();
    applyViewFrame(v, { type: "heat", level: 0, finale: true });
    applyViewFrame(v, { type: "heat", level: 0, finale: true });
    expect(v.heatFinales).toBe(2);
  });

  it("ignores a malformed frame", () => {
    const v = view();
    applyViewFrame(v, { type: "heat", level: 9, finale: false });
    applyViewFrame(v, { type: "paneMode", inCopyMode: "yes" });
    expect(v).toEqual(view());
  });

  it("does nothing for a view that is gone", () => {
    expect(() => applyViewFrame(undefined, { type: "heat", level: 1, finale: false })).not.toThrow();
  });
});
