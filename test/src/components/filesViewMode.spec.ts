import { describe, it, expect } from "vitest";
import {
  FILES_VIEW_MODES,
  VIEW_MODE_SESSIONS_MAX,
  inheritedView,
  parseViewModeStore,
  viewModeFor,
  viewModeOf,
  withViewMode,
} from "../../../src/components/filesViewMode";

describe("viewModeOf", () => {
  it.each([
    [false, false, "edit"],
    [true, false, "preview"],
    [false, true, "canvas"],
    [true, true, "canvas"], // the Canvas view is drawn over Preview
  ] as const)("showPreview %s, showCanvas %s is %s", (showPreview, showCanvas, mode) => {
    expect(viewModeOf({ showPreview, showCanvas })).toBe(mode);
  });
});

describe("inheritedView", () => {
  it("carries Preview and the Canvas view to a file with no memory of its own", () => {
    expect(inheritedView("preview", false)).toEqual({ showPreview: true, showCanvas: false });
    expect(inheritedView("canvas", false)).toEqual({ showPreview: false, showCanvas: true });
  });

  it("carries nothing for the editor, and nothing over a file's own memory", () => {
    expect(inheritedView("edit", false)).toBeNull();
    FILES_VIEW_MODES.forEach((mode) => expect(inheritedView(mode, true)).toBeNull());
  });
});

describe("the per-session store", () => {
  it("is empty for nothing, junk, or a shape it did not write", () => {
    [null, "", "not json", "{}", '"x"', "[1,2]"].forEach((raw) => expect(parseViewModeStore(raw)).toEqual([]));
  });

  it("drops a bad entry and keeps the good ones", () => {
    const raw = JSON.stringify([["s1", "preview"], ["s2", "wide"], ["", "canvas"], ["s3"], ["s4", "canvas", "x"], [5, "edit"], ["s5", "canvas"]]);
    expect(parseViewModeStore(raw)).toEqual([
      ["s1", "preview"],
      ["s5", "canvas"],
    ]);
  });

  it("answers the editor for a session it does not know", () => {
    expect(viewModeFor([["s1", "preview"]], "s2")).toBe("edit");
    expect(viewModeFor([["s1", "preview"]], "s1")).toBe("preview");
  });

  it("moves a session to the front, once, and round-trips", () => {
    const store = withViewMode(withViewMode(withViewMode([], "s1", "preview"), "s2", "canvas"), "s1", "edit");
    expect(store).toEqual([
      ["s1", "edit"],
      ["s2", "canvas"],
    ]);
    expect(parseViewModeStore(JSON.stringify(store))).toEqual(store);
  });

  it("forgets the oldest session past the cap, on write and on read", () => {
    const full = Array.from({ length: VIEW_MODE_SESSIONS_MAX }, (_, index) => `s${index}`).reduce(
      (store, id) => withViewMode(store, id, "preview"),
      withViewMode([], "first", "canvas"),
    );
    expect(full).toHaveLength(VIEW_MODE_SESSIONS_MAX);
    expect(viewModeFor(full, "first")).toBe("edit");
    const tooMany = JSON.stringify(Array.from({ length: VIEW_MODE_SESSIONS_MAX + 5 }, (_, index) => [`s${index}`, "preview"]));
    expect(parseViewModeStore(tooMany)).toHaveLength(VIEW_MODE_SESSIONS_MAX);
  });
});
