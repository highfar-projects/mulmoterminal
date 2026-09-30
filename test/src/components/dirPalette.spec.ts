import { describe, it, expect } from "vitest";
import { paletteFromValue, pickerColor, withPaletteColor } from "../../../src/components/dirPalette";

describe("paletteFromValue", () => {
  it("keeps the known keys holding a colour xterm reads", () => {
    expect(paletteFromValue({ background: "#000", red: "#ff000080", blue: "#12345G", teal: "#00ffff", green: 3 })).toEqual({
      background: "#000",
      red: "#ff000080",
    });
  });

  it.each([null, undefined, "#000000", ["#000000"], 3])("reads %j as no palette", (value) => {
    expect(paletteFromValue(value)).toEqual({});
  });
});

describe("withPaletteColor", () => {
  it("sets one colour and keeps the rest", () => {
    expect(withPaletteColor({ red: "#ff0000" }, "blue", "#0000ff")).toEqual({ red: "#ff0000", blue: "#0000ff" });
    expect(withPaletteColor({ red: "#ff0000" }, "red", "#aa0000")).toEqual({ red: "#aa0000" });
  });

  it("removes a colour for null, and only that one", () => {
    expect(withPaletteColor({ red: "#ff0000", blue: "#0000ff" }, "red", null)).toEqual({ blue: "#0000ff" });
    expect(withPaletteColor({}, "red", null)).toEqual({});
  });
});

describe("pickerColor", () => {
  it.each([
    [undefined, "#808080"],
    ["#abc", "#aabbcc"],
    ["#AABBCC", "#aabbcc"],
    ["#11223380", "#112233"],
    ["#1234", "#112233"],
  ])("%j -> %j", (color, shown) => {
    expect(pickerColor(color)).toBe(shown);
  });
});
