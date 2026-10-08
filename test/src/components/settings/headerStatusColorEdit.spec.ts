import { describe, it, expect } from "vitest";
import { HEADER_STATUS_KEYS, sanitizeHeaderStatusColors, type HeaderStatusColors } from "../../../../common/headerStatusColors";
import { cssColorToHex, withoutStatus, withStatusBackground, withStatusText } from "../../../../src/components/settings/headerStatusColorEdit";

const SOME: HeaderStatusColors = { working: { background: "#112233", text: null }, blocked: { background: null, text: "#ffffff" } };

describe("withStatusBackground / withStatusText", () => {
  it("sets one part of one status and leaves the rest as they were", () => {
    expect(withStatusBackground(SOME, "done", "#00aa00")).toEqual({ ...SOME, done: { background: "#00aa00", text: null } });
    expect(withStatusText(SOME, "working", "#eeeeee")).toEqual({ ...SOME, working: { background: "#112233", text: "#eeeeee" } });
  });

  it("removes a status once neither part is set, so the file says 'the theme decides'", () => {
    expect(withStatusBackground(SOME, "working", null)).toEqual({ blocked: SOME.blocked });
    expect(withStatusText(SOME, "blocked", null)).toEqual({ working: SOME.working });
  });

  it("keeps a status that still has the other part", () => {
    const both = withStatusText(SOME, "working", "#000000");
    expect(withStatusBackground(both, "working", null)).toEqual({ ...SOME, working: { background: null, text: "#000000" } });
  });

  it("treats a value that is not a 6-digit hex as unset", () => {
    ["red", "#fff", "", "#12345g"].forEach((bad) => {
      expect(withStatusBackground({}, "done", bad)).toEqual({});
      expect(withStatusText({}, "done", bad)).toEqual({});
    });
  });

  it("does not change the input", () => {
    const before = structuredClone(SOME);
    withStatusBackground(SOME, "working", "#999999");
    withoutStatus(SOME, "blocked");
    expect(SOME).toEqual(before);
  });

  it("produces what the server's sanitizer keeps unchanged, for every status and part", () => {
    HEADER_STATUS_KEYS.forEach((key) => {
      [withStatusBackground(SOME, key, "#abcdef"), withStatusText(SOME, key, "#abcdef"), withoutStatus(SOME, key)].forEach((next) =>
        expect(sanitizeHeaderStatusColors(next)).toEqual(next),
      );
    });
  });
});

describe("withoutStatus", () => {
  it("drops the status, and is a no-op for one that is not set", () => {
    expect(withoutStatus(SOME, "working")).toEqual({ blocked: SOME.blocked });
    expect(withoutStatus(SOME, "done")).toEqual(SOME);
  });
});

describe("cssColorToHex", () => {
  it("reads rgb(), rgba() and hex", () => {
    expect(cssColorToHex("rgb(27, 58, 107)")).toBe("#1b3a6b");
    expect(cssColorToHex("rgba(0, 0, 0, 0.5)")).toBe("#000000");
    expect(cssColorToHex(" #ABCDEF ")).toBe("#abcdef");
    expect(cssColorToHex("rgb(255,255,255)")).toBe("#ffffff");
  });

  it("reads the alpha forms CSS allows on either name", () => {
    expect(cssColorToHex("rgb(1, 2, 3, 0.5)")).toBe("#010203");
    expect(cssColorToHex("rgba(1, 2, 3)")).toBe("#010203");
  });

  it("reads the space syntax too, with or without an alpha", () => {
    expect(cssColorToHex("rgb(27 58 107)")).toBe("#1b3a6b");
    expect(cssColorToHex("rgb(0 0 0 / 0.5)")).toBe("#000000");
    expect(cssColorToHex("rgba(255 255 255 / 50%)")).toBe("#ffffff");
  });

  it("gives up on anything else rather than guessing", () => {
    [
      "",
      "transparent",
      "color(srgb 0.1 0.2 0.3)",
      "rgb(256, 0, 0)",
      "rgb(1.5, 2, 3)",
      "rgb(1, 2)",
      "hsl(0, 0%, 0%)",
      "#fff",
      "rgb(1, 2, 3 / 0.5)",
      "rgb(1 2 3 4)",
    ].forEach((css) => expect(cssColorToHex(css)).toBeNull());
  });
});
