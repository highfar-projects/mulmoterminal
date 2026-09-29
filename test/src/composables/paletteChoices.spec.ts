import { describe, it, expect } from "vitest";
import { choiceTarget, paletteChoices } from "../../../src/composables/paletteChoices";

// #2455. Which settings the palette switches in place, and which one is in effect.
const TEXT = {
  theme: (name: string) => `Theme: ${name}`,
  language: (name: string) => `Language: ${name}`,
  autoLanguage: "Auto",
  soundOff: "Sound off",
  soundOn: "Sound on",
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
