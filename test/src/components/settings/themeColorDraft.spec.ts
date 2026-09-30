// #2623. What the colour editor shows for each variable, and when a draft counts as changed.
import { describe, it, expect } from "vitest";
import { copyLabel, draftDiffers, pickerValue, withDraftColors } from "../../../../src/components/settings/themeColorDraft";
import { THEME_VAR_KEYS, resolveThemeVars } from "../../../../common/themeVars";

const resolved = resolveThemeVars({ id: "all", label: "All", colors: Object.fromEntries(THEME_VAR_KEYS.map((key) => [key, "#123456"])) }, {});

describe("pickerValue", () => {
  it("shows the theme's own colour, else its base's, as #rrggbb", () => {
    expect(pickerValue("--accent", { "--accent": "#ABC" }, resolved)).toBe("#aabbcc");
    expect(pickerValue("--accent", { "--accent": "#aabbcc80" }, resolved)).toBe("#aabbcc");
    expect(pickerValue("--accent", {}, resolved)).toBe("#123456");
  });

  it("shows black for a colour it cannot read or cannot resolve", () => {
    expect(pickerValue("--accent", {}, null)).toBe("#000000");
    expect(pickerValue("--accent", { "--accent": "rgb(1,2,3)" }, resolved)).toBe("#000000");
  });
});

describe("draftDiffers", () => {
  it("is false for the same colours and true for any added, changed or dropped one", () => {
    expect(draftDiffers({ "--accent": "#fff" }, { "--accent": "#fff" })).toBe(false);
    expect(draftDiffers({}, { "--accent": "#fff" })).toBe(true);
    expect(draftDiffers({ "--accent": "#fff" }, { "--accent": "#000" })).toBe(true);
    expect(draftDiffers({ "--accent": "#fff" }, {})).toBe(true);
  });
});

describe("helpers", () => {
  it("puts the draft in place of the theme's colours, and names a copy", () => {
    expect(withDraftColors({ id: "a", label: "A", extends: "nord", colors: { "--text": "#fff" } }, { "--accent": "#000" })).toEqual({
      id: "a",
      label: "A",
      extends: "nord",
      colors: { "--accent": "#000" },
    });
    expect(copyLabel("Nord", "copy")).toBe("Nord copy");
  });
});
