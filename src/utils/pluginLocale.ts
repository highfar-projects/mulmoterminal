import type { UiLocale } from "../composables/uiLanguage";

// The shared plugins' message tables are keyed by MulmoClaude's locale codes, and gui-chat-protocol's
// pickMessages takes an EXACT key, so handing them `zh-CN` would land on English. They carry one
// Chinese table, so both scripts read it; a Record makes a new UI locale a type error until mapped.
const PLUGIN_LOCALE: Record<UiLocale, string> = {
  en: "en",
  ja: "ja",
  "zh-CN": "zh",
  "zh-TW": "zh",
  ko: "ko",
};

export const pluginLocaleFor = (uiLocale: UiLocale): string => PLUGIN_LOCALE[uiLocale];
