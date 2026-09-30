// #2623. A custom theme is made as a copy and recoloured one theme at a time.
import { describe, it, expect } from "vitest";
import {
  CUSTOM_THEMES_MAX,
  THEME_LABEL_MAX,
  copyId,
  duplicateTheme,
  isThemeProblem,
  themeColorsFrom,
  themesWithColors,
  type ThemeEntry,
} from "../../common/themeEntries";
import { THEME_VAR_KEYS } from "../../common/themeVars";

const mine: ThemeEntry = { id: "mine", label: "Mine", extends: "nord", colors: { "--accent": "#ff0000" }, term: { cursor: "#00ff00" } };
const full: ThemeEntry = { id: "full", label: "Full", colors: Object.fromEntries(THEME_VAR_KEYS.map((key) => [key, "#101010"])) };

describe("copyId", () => {
  it("takes the first free -copy suffix, cut to 32 characters", () => {
    expect(copyId("nord", [])).toBe("nord-copy");
    expect(copyId("nord", ["nord-copy"])).toBe("nord-copy-2");
    expect(copyId("nord", ["nord-copy", "nord-copy-2"])).toBe("nord-copy-3");
    const long = "a".repeat(40);
    expect(copyId(long, [])).toHaveLength(32);
    expect(copyId(long, [])).toMatch(/-copy$/);
  });
});

describe("duplicateTheme", () => {
  it("copies a built-in as a theme that extends it with no colours of its own", () => {
    expect(duplicateTheme("nord", " Nord copy ", [])).toEqual({ theme: { id: "nord-copy", label: "Nord copy", extends: "nord", colors: {} } });
  });

  it("copies a custom theme whole, without sharing its objects", () => {
    const built = duplicateTheme("mine", "Mine 2", [mine]);
    expect(built).toEqual({ theme: { id: "mine-copy", label: "Mine 2", extends: "nord", colors: { "--accent": "#ff0000" }, term: { cursor: "#00ff00" } } });
    if ("theme" in built) expect(built.theme.colors).not.toBe(mine.colors);
    expect(duplicateTheme("full", "F", [full])).toEqual({ theme: { id: "full-copy", label: "F", colors: full.colors } });
  });

  it("refuses an unknown source, a bad label, and a full list", () => {
    expect(duplicateTheme("nope", "x", [])).toEqual({ problem: "source" });
    expect(duplicateTheme("nord", "  ", [])).toEqual({ problem: "label" });
    expect(duplicateTheme("nord", "x".repeat(THEME_LABEL_MAX + 1), [])).toEqual({ problem: "label" });
    expect(duplicateTheme("nord", "x".repeat(THEME_LABEL_MAX), [])).toHaveProperty("theme");
    const many = Array.from({ length: CUSTOM_THEMES_MAX }, (_, i) => ({ ...mine, id: `t${i}` }));
    expect(duplicateTheme("nord", "x", many)).toEqual({ problem: "full" });
  });
});

describe("themeColorsFrom", () => {
  it("keeps a map of theme variables to colours, and refuses anything else", () => {
    expect(themeColorsFrom({ "--accent": "#abc", "--text": "#aabbccdd" })).toEqual({ "--accent": "#abc", "--text": "#aabbccdd" });
    expect(themeColorsFrom({})).toEqual({});
    [null, "x", { "--nope": "#fff" }, { "--accent": "red" }, { "--accent": 1 }].forEach((value) => expect(themeColorsFrom(value)).toBeNull());
  });
});

describe("themesWithColors", () => {
  it("replaces the colours of that theme only", () => {
    expect(themesWithColors([mine, full], "mine", { "--text": "#fff" })).toEqual({ themes: [{ ...mine, colors: { "--text": "#fff" } }, full] });
  });

  it("refuses a missing theme, and an incomplete set on a theme with no base", () => {
    expect(themesWithColors([mine], "gone", {})).toEqual({ problem: "missing" });
    expect(themesWithColors([full], "full", { "--text": "#fff" })).toEqual({ problem: "colors" });
    expect(themesWithColors([full], "full", full.colors)).toHaveProperty("themes");
  });

  it("isThemeProblem knows only its words", () => {
    expect(isThemeProblem("colors")).toBe(true);
    expect(isThemeProblem("stale")).toBe(false);
  });
});
