import { describe, it, expect, afterEach, vi } from "vitest";
import { usePaletteFrecency } from "../../../src/composables/usePaletteFrecency";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("usePaletteFrecency", () => {
  it("remembers a pick for the next opening, not the one it was made in", () => {
    const opening = usePaletteFrecency();
    opening.remember("zoom-toggle");
    expect(opening.scoreOf("zoom-toggle")).toBe(0);
    expect(usePaletteFrecency().scoreOf("zoom-toggle")).toBeGreaterThan(0);
  });

  it("orders nothing, and throws nothing, when the browser keeps nothing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const opening = usePaletteFrecency();
    expect(() => opening.remember("zoom-toggle")).not.toThrow();
    expect(opening.scoreOf("zoom-toggle")).toBe(0);
  });

  it("reads a corrupted store as empty", () => {
    localStorage.setItem("mt-palette-frecency", "{not json");
    expect(usePaletteFrecency().scoreOf("zoom-toggle")).toBe(0);
  });
});
