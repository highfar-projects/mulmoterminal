import { describe, it, expect } from "vitest";
import { withEnglish } from "../../src/i18n/englishAnchor";

// #2204. The anchor exists for a reader who cannot read the screen it is on, so the cases that
// matter are the ones where it would be absent or doubled.

describe("withEnglish", () => {
  it("puts English beside a label the reader may not be able to read", () => {
    expect(withEnglish("언어", "Language", "ko")).toBe("언어 (Language)");
  });

  it("says nothing twice when the UI is already English", () => {
    expect(withEnglish("Language", "Language", "en")).toBe("Language");
  });

  // The picker's own list is where this would show worst: `English (English)` would make the entry
  // an English reader is scanning for the noisiest line in it.
  it("does not bracket a label that is already its own English", () => {
    expect(withEnglish("English", "English", "ja")).toBe("English");
  });

  // Every locale the app ships, through the one function, so a locale added later cannot quietly
  // lose its anchor.
  it.each([
    ["ja", "日本語", "Japanese", "日本語 (Japanese)"],
    ["zh-CN", "简体中文", "Chinese, Simplified", "简体中文 (Chinese, Simplified)"],
    ["zh-TW", "繁體中文", "Chinese, Traditional", "繁體中文 (Chinese, Traditional)"],
    ["ko", "한국어", "Korean", "한국어 (Korean)"],
  ])("anchors %s", (uiLocale, localized, english, expected) => {
    expect(withEnglish(localized, english, uiLocale)).toBe(expected);
  });

  // A locale whose translation is missing falls back to the English string, and bracketing it
  // would show the same words twice rather than admitting the gap.
  it("does not bracket an untranslated string", () => {
    expect(withEnglish("Toolbar pins", "Toolbar pins", "ko")).toBe("Toolbar pins");
  });
});
