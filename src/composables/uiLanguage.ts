import { ref, watch } from "vue";
import { browserLocale } from "../utils/browserLocale";

// Which language the app's own chrome is written in.
//
//   auto     — the browser's, when there is a bundle for it (the default)
//   <code>   — the one you picked, whatever the browser is set to
//
// Per browser (localStorage), like the theme and the terminal font size, and unlike `fontFamily`:
// a phone and a desktop can want different languages, and nothing on the server reads this.
const STORAGE_KEY = "ui_language";

export const UI_LANGUAGE_AUTO = "auto";

/** The bundles that exist. Adding one here is not enough — it needs messages under the same code
 *  in `src/i18n`, which is what the type on `ja` enforces.
 *
 *  The two Chinese entries are not one bundle with a font swap: the scripts carry different
 *  vocabulary (软件 / 軟體, 程序 / 程式, 网络 / 網路), so a reader of one is served badly by the
 *  other. Labels are endonyms — what a speaker calls their own language is what they scan for. */
export const UI_LOCALES = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ko", label: "한국어" },
] as const;

export type UiLocale = (typeof UI_LOCALES)[number]["code"];
export type UiLanguage = typeof UI_LANGUAGE_AUTO | UiLocale;

export const isUiLocale = (raw: string): raw is UiLocale => UI_LOCALES.some((locale) => locale.code === raw);

/** Anything else on disk — a bundle that has since been removed, a hand-edited value — reads as
 *  `auto` rather than being handed to vue-i18n, where it would resolve to no messages at all. */
export const parseUiLanguage = (raw: string | null): UiLanguage => (raw && isUiLocale(raw) ? raw : UI_LANGUAGE_AUTO);

export const uiLanguage = ref<UiLanguage>(parseUiLanguage(localStorage.getItem(STORAGE_KEY)));
watch(uiLanguage, (language) => localStorage.setItem(STORAGE_KEY, language));

const CHINESE = /^zh(-|$)/;
/** Traditional script, by the tags a browser actually sends. `zh-Hant` is the script subtag;
 *  the three regions are the places that write it, and Hong Kong and Macau are the two that a
 *  region check written from "Taiwan vs. Beijing" drops on the floor. Everything else Chinese —
 *  `zh`, `zh-CN`, `zh-SG`, `zh-Hans-*` — is simplified. */
const TRADITIONAL_CHINESE = /^zh-(hant|tw|hk|mo)(-|$)/;

/** The UI locale this browser is asking for.
 *
 *  Reads `navigator.language` WHOLE rather than going through `browserLocale()`, which drops the
 *  script and the region — `zh-Hant-TW` and `zh-CN` both arrive there as `zh`, and the two Chinese
 *  bundles are not interchangeable. `browserLocale()` is deliberately left alone: its other callers
 *  hand the tag to whisper, to the server's translation route and to the shared plugins, none of
 *  which distinguish the scripts, so widening it there would change what gets transcribed and
 *  cached rather than only what gets rendered.
 *
 *  Exported because the Settings line that spells out what `auto` resolved to has to name the tag
 *  this function judged, not a different one. */
export function browserUiLocale(): string {
  const full = (navigator.language || "en").toLowerCase();
  if (!CHINESE.test(full)) return browserLocale();
  return TRADITIONAL_CHINESE.test(full) ? "zh-TW" : "zh-CN";
}

/** What to actually render in. A browser we have no bundle for falls back to English rather than
 *  to keys. */
export function resolveUiLocale(language: UiLanguage): UiLocale {
  if (language !== UI_LANGUAGE_AUTO) return language;
  const browser = browserUiLocale();
  return isUiLocale(browser) ? browser : "en";
}
