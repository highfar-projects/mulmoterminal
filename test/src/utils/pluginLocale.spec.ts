// The shared plugins look their messages up by an exact key from MulmoClaude's locale list, and fall
// back to English on any other — so a UI locale mapped to a code outside that list silently shows
// English. Every display language must land inside it.
import { describe, it, expect } from "vitest";
import { UI_LOCALES } from "../../../src/composables/uiLanguage";
import { pluginLocaleFor } from "../../../src/utils/pluginLocale";

// MulmoClaude's SUPPORTED_LOCALES (src/lang/index.ts there), which the plugins' tables are keyed by.
const PLUGIN_TABLE_KEYS = ["en", "ja", "zh", "ko", "es", "pt-BR", "fr", "de"];

describe("pluginLocaleFor", () => {
  it("maps every display language to a key the plugins' tables have", () => {
    UI_LOCALES.forEach(({ code }) => {
      expect(PLUGIN_TABLE_KEYS).toContain(pluginLocaleFor(code));
    });
  });

  it("keeps a language the tables share, and sends both Chinese scripts to the one Chinese table", () => {
    expect(pluginLocaleFor("en")).toBe("en");
    expect(pluginLocaleFor("ja")).toBe("ja");
    expect(pluginLocaleFor("ko")).toBe("ko");
    expect(pluginLocaleFor("zh-CN")).toBe("zh");
    expect(pluginLocaleFor("zh-TW")).toBe("zh");
  });
});
