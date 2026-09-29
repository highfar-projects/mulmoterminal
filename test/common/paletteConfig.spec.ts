import { describe, it, expect } from "vitest";
import {
  MAX_PALETTE_ALIASES,
  MAX_PALETTE_FAVORITES,
  MAX_PALETTE_KEY_CHARS,
  normalizeAlias,
  sanitizePaletteAliases,
  sanitizePaletteFavorites,
} from "../../common/paletteConfig";

describe("sanitizePaletteAliases", () => {
  it("keeps string-to-string pairs, trimmed, and drops the rest", () => {
    expect(sanitizePaletteAliases({ " z ": " zoom-toggle ", w: "screen:wiki", n: 1, "": "x", e: "  ", long: "k".repeat(MAX_PALETTE_KEY_CHARS + 1) })).toEqual({
      z: "zoom-toggle",
      w: "screen:wiki",
    });
  });

  it("keeps the first of aliases that differ only in case or spaces", () => {
    expect(sanitizePaletteAliases({ wk: "screen:wiki", " WK ": "zoom-toggle", z: "zoom-toggle" })).toEqual({ wk: "screen:wiki", z: "zoom-toggle" });
  });

  it("reads anything but an object as none, and caps how many it keeps", () => {
    expect(sanitizePaletteAliases(["z"])).toEqual({});
    expect(sanitizePaletteAliases(null)).toEqual({});
    const many = Object.fromEntries(Array.from({ length: MAX_PALETTE_ALIASES + 5 }, (_, i) => [`a${i}`, "zoom-toggle"]));
    expect(Object.keys(sanitizePaletteAliases(many))).toHaveLength(MAX_PALETTE_ALIASES);
  });
});

describe("sanitizePaletteFavorites", () => {
  it("keeps strings, trimmed and once each, in the order written", () => {
    expect(sanitizePaletteFavorites([" screen:wiki ", "zoom-toggle", 3, "", "screen:wiki"])).toEqual(["screen:wiki", "zoom-toggle"]);
  });

  it("reads anything but a list as none, and caps how many it keeps", () => {
    expect(sanitizePaletteFavorites({ a: "b" })).toEqual([]);
    expect(sanitizePaletteFavorites(Array.from({ length: MAX_PALETTE_FAVORITES + 5 }, (_, i) => `k${i}`))).toHaveLength(MAX_PALETTE_FAVORITES);
  });
});

describe("normalizeAlias", () => {
  it("ignores case and the spaces around it", () => {
    expect(normalizeAlias("  Wk ")).toBe("wk");
  });
});
