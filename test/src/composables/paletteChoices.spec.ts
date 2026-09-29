import { describe, it, expect } from "vitest";
import { choiceTarget, paletteChoices } from "../../../src/composables/paletteChoices";

// #2455. Which settings the palette switches in place, and which one is in effect.
const TEXT = {
  theme: (name: string) => `Theme: ${name}`,
  language: (name: string) => `Language: ${name}`,
  autoLanguage: "Auto",
  soundOff: "Sound off",
  soundOn: "Sound on",
  view: (name: string) => `View: ${name}`,
  viewList: "Roster",
  viewStrip: "Strip",
  sort: (name: string) => `Order: ${name}`,
  sortLabel: (mode: string) => mode,
};
const STATE = {
  themes: [
    { id: "midnight", label: "Midnight" },
    { id: "my:theme", label: "Mine" },
  ],
  themeId: "my:theme",
  languages: [
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
  ],
  language: "auto" as const,
  soundOn: true,
  grid: null,
};

describe("paletteChoices", () => {
  it("lists every theme, Automatic and every language, then the sound", () => {
    expect(paletteChoices(STATE, TEXT).map((choice) => choice.id)).toEqual([
      "theme:midnight",
      "theme:my:theme",
      "language:auto",
      "language:en",
      "language:ja",
      "sound",
    ]);
  });

  it("marks the theme and the language in effect", () => {
    const current = paletteChoices(STATE, TEXT)
      .filter((choice) => choice.current)
      .map((choice) => choice.id);
    expect(current).toEqual(["theme:my:theme", "language:auto"]);
  });

  it("offers the sound switch that would change it", () => {
    expect(paletteChoices(STATE, TEXT).at(-1)).toMatchObject({ label: "Sound off", icon: "volume_off" });
    expect(paletteChoices({ ...STATE, soundOn: false }, TEXT).at(-1)).toMatchObject({ label: "Sound on", icon: "volume_up" });
  });
});

describe("choiceTarget", () => {
  it("splits at the first colon, so a theme id holding one survives", () => {
    expect(choiceTarget("theme:my:theme")).toEqual({ group: "theme", value: "my:theme" });
    expect(choiceTarget("language:zh-CN")).toEqual({ group: "language", value: "zh-CN" });
    expect(choiceTarget("sound")).toEqual({ group: "sound", value: "" });
  });
});

// #2458. The grid's view and cell order, offered only while a grid is mounted to switch them.
describe("grid choices", () => {
  const GRID = { ...STATE, grid: { listMode: false, sortMode: "manual" as const } };

  it("lists the two views and the three orders, marking the ones in effect", () => {
    const grid = paletteChoices(GRID, TEXT).filter((choice) => choice.id.startsWith("view:") || choice.id.startsWith("sort:"));
    expect(grid.map((choice) => [choice.id, choice.current])).toEqual([
      ["view:list", false],
      ["view:strip", true],
      ["sort:auto", false],
      ["sort:manual", true],
      ["sort:priority", false],
    ]);
    expect(grid[3]).toMatchObject({ label: "Order: manual", icon: "reorder" });
  });

  it("offers none of them with no grid", () => {
    expect(paletteChoices(STATE, TEXT).some((choice) => choice.id.startsWith("view:") || choice.id.startsWith("sort:"))).toBe(false);
  });
});
