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

const isHanScript = (script: string | undefined): boolean => script === "Hans" || script === "Hant";

/** `zh-CN` / `zh-TW` for a tag written in Chinese, else null.
 *
 *  TWO questions, both put to CLDR rather than to a list kept here:
 *
 *  1. is this tag's LANGUAGE written in Han script at all? Asked by maximizing the language
 *     subtag ALONE — `zh`, `yue`, `nan`, `hak`, `wuu` and `lzh` come back Han; `en`, `fr`, `ja`
 *     and `ko` do not.
 *  2. which script is THIS tag in? An explicit script beats the region both ways round, so
 *     `zh-Hans-HK` is simplified and `zh-Hant-CN` is traditional.
 *
 *  Question 1 is not optional, and dropping it is a bug rather than a simplification: `maximize()`
 *  KEEPS an explicit script whatever the language, so `en-Hant` — well-formed, and nothing to do
 *  with Chinese — comes back `Hant` and would render the entire UI in traditional Chinese.
 *
 *  The pair fails CLOSED. A language CLDR does not know, or one written in some other script,
 *  returns null and takes the bare-subtag path below — which is what every non-Chinese browser
 *  did before any of this existed. */
function chineseScriptLocale(tag: string): UiLocale | null {
  try {
    const locale = new Intl.Locale(tag);
    if (!isHanScript(new Intl.Locale(locale.language).maximize().script)) return null;
    const script = locale.maximize().script;
    if (script === "Hant") return "zh-TW";
    if (script === "Hans") return "zh-CN";
    return null;
  } catch {
    // Not a Unicode locale id. The caller retries with the bare subtag, which is what rescues
    // RFC 5646's deprecated extlang forms — `zh-yue`, `zh-cmn`, `zh-hak` are valid BCP 47 and a
    // browser may still send one, but UTS 35 has no extlangs, so parsing the whole tag throws.
    return null;
  }
}

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
  const tag = navigator.language;
  // Not a tag at all: a browser reporting nothing, or a stub handing us something that is not a
  // string. `Intl.Locale` throws on both, and this is the boot path.
  if (typeof tag !== "string" || tag.trim() === "") return "en";
  const chinese = chineseScriptLocale(tag) ?? chineseScriptLocale(browserLocale());
  if (chinese) return chinese;
  // A tag that is not one still gets reported verbatim — `zh_TW` in the Settings line is the
  // truth about what the browser asked for, and useful. What must not reach that line is a BLANK:
  // `browserLocale()` splits `-US` into an empty string, and an empty string rendered mid-sentence
  // reads as a broken template rather than as the fallback it is.
  const bare = browserLocale();
  return bare.trim() === "" ? "en" : bare;
}

/** What to actually render in. A browser we have no bundle for falls back to English rather than
 *  to keys. */
export function resolveUiLocale(language: UiLanguage): UiLocale {
  if (language !== UI_LANGUAGE_AUTO) return language;
  const browser = browserUiLocale();
  return isUiLocale(browser) ? browser : "en";
}
