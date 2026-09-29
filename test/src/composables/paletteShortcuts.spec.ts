import { describe, it, expect } from "vitest";
import { aliasTarget, aliasesByKey, pinRows } from "../../../src/composables/paletteShortcuts";

describe("aliasesByKey", () => {
  it("gathers every alias written for a row", () => {
    expect(aliasesByKey({ w: "screen:wiki", wk: "screen:wiki", z: "zoom-toggle" })).toEqual(
      new Map([
        ["screen:wiki", ["w", "wk"]],
        ["zoom-toggle", ["z"]],
      ]),
    );
  });
});

describe("aliasTarget", () => {
  it("names the row when the query is the alias, whatever its case and spacing", () => {
    expect(aliasTarget({ Wk: "screen:wiki" }, "  wK ")).toBe("screen:wiki");
  });

  it("names nothing for part of an alias, another word, or nothing typed", () => {
    expect(aliasTarget({ wk: "screen:wiki" }, "w")).toBeNull();
    expect(aliasTarget({ wk: "screen:wiki" }, "wkx")).toBeNull();
    expect(aliasTarget({ "": "screen:wiki" }, "")).toBeNull();
  });
});

describe("pinRows", () => {
  const rows = ["a", "b", "c", "d"];
  const same = (row: string) => row;

  it("puts favorites first in the order written, only with nothing typed", () => {
    expect(pinRows(rows, same, { favorites: ["c", "x", "b"], nothingTyped: true, aliased: null })).toEqual(["c", "b", "a", "d"]);
    expect(pinRows(rows, same, { favorites: ["c", "b"], nothingTyped: false, aliased: null })).toEqual(rows);
  });

  it("puts the aliased row above everything, favorites included", () => {
    expect(pinRows(rows, same, { favorites: ["c"], nothingTyped: true, aliased: "d" })).toEqual(["d", "c", "a", "b"]);
  });

  it("leaves the order alone when nothing is pinned or the pin is not listed", () => {
    expect(pinRows(rows, same, { favorites: [], nothingTyped: true, aliased: null })).toEqual(rows);
    expect(pinRows(rows, same, { favorites: [], nothingTyped: false, aliased: "zz" })).toEqual(rows);
  });
});
