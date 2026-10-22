// The shared plugins look their messages up by an exact key from MulmoClaude's locale list, and fall
// back to English on any other — so a UI locale mapped to a code outside that list silently shows
// English. Every display language must land inside it.
import { describe, it, expect } from "vitest";
import { createI18n } from "vue-i18n";
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

// accountingUi hands its plugin the display language as a full tag instead, which is right only
// because that plugin runs its own vue-i18n, and vue-i18n walks zh-TW back to zh.
const PLUGIN_MESSAGES: Record<string, { hi: string }> = { en: { hi: "hello" }, zh: { hi: "你好" }, ja: { hi: "こんにちは" }, ko: { hi: "안녕" } };

describe("the full-tag host (accounting)", () => {
  it("still find a plugin's language table from a regional tag, and keep the region", () => {
    const pluginI18n = createI18n({
      legacy: false,
      locale: "en",
      fallbackLocale: "en",
      missingWarn: false,
      fallbackWarn: false,
      messages: PLUGIN_MESSAGES,
    });
    const expected = { en: ["hello", "US"], ja: ["こんにちは", "JP"], "zh-CN": ["你好", "CN"], "zh-TW": ["你好", "TW"], ko: ["안녕", "KR"] };
    UI_LOCALES.forEach(({ code }) => {
      pluginI18n.global.locale.value = code;
      expect([pluginI18n.global.t("hi"), new Intl.Locale(code).maximize().region]).toEqual(expected[code]);
    });
  });
});
