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
/** Where the traditional script is written. Only consulted for a Chinese tag whose own script is
 *  neither `Hans` nor `Hant` — see `chineseScriptLocale`. */
const TRADITIONAL_REGIONS = new Set(["TW", "HK", "MO"]);

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
    const maximized = locale.maximize();
    if (maximized.script === "Hant") return "zh-TW";
    if (maximized.script === "Hans") return "zh-CN";
    // The language is Chinese but this tag is written in neither Han script — `zh-Latn` is pinyin,
    // `zh-Bopo` is zhuyin, `yue-Latn` is jyutping. We ship no romanized bundle, and English serves
    // a Chinese reader worse than either Chinese bundle does, so the REGION decides instead. CLDR
    // knows it: zhuyin maximizes to TW and pinyin to CN, which is the answer a reader of each
    // would want and the one a bare-language fallback gets wrong.
    return TRADITIONAL_REGIONS.has(maximized.region ?? "") ? "zh-TW" : "zh-CN";
  } catch {
    // Not a Unicode locale id. The caller retries with the bare subtag, which is what rescues
    // RFC 5646's deprecated extlang forms — `zh-yue`, `zh-cmn`, `zh-hak` are valid BCP 47 and a
    // browser may still send one, but UTS 35 has no extlangs, so parsing the whole tag throws.
    return null;
  }
}

/** Which bundle this browser is asking for.
 *
 *  Reads `navigator.language` WHOLE rather than going through `browserLocale()`, which drops the
 *  script and the region — `zh-Hant-TW` and `zh-CN` both arrive there as `zh`, and the two Chinese
 *  bundles are not interchangeable. `browserLocale()` is deliberately left alone: its other callers
 *  hand the tag to whisper, to the server's translation route and to the shared plugins, none of
 *  which distinguish the scripts, so widening it there would change what gets transcribed and
 *  cached rather than only what gets rendered.
 *
 *  The second `chineseScriptLocale` call retries the BARE subtag, and it can only ever change the
 *  answer for a tag that would not PARSE — RFC 5646's extlang forms, `zh-yue` and friends. For any
 *  tag that parses, the bare subtag IS its language, and the language is what the first call
 *  already judged. */
function browserUiLocale(): string {
  const tag = navigator.language;
  // Not a tag at all: a browser reporting nothing, or a stub handing us something that is not a
  // string. `Intl.Locale` throws on both, and this is the boot path.
  if (typeof tag !== "string" || tag.trim() === "") return "en";
  // A blank or unparseable answer needs no guard here — `resolveUiLocale` matches it against the
  // bundles and lands on English. Only the DISPLAY of a tag has to be non-blank, and that is
  // `browserLanguageTag`'s job now.
  return chineseScriptLocale(tag) ?? chineseScriptLocale(browserLocale()) ?? browserLocale();
}

/** The tag the browser ASKED FOR, for the Settings line that explains what `auto` resolved to.
 *
 *  Deliberately NOT `browserUiLocale()`'s answer. That sentence reads "your browser asks for X, so
 *  this reads as Y", and filling X with the locale we resolved TO makes it circular for a `zh-CN`
 *  browser and FALSE for anything that resolved across languages — a `yue-HK` browser was being
 *  told it had asked for `zh-TW`. The whole tag is also more use to the reader than the bare
 *  subtag: `zh-Hant-TW` says why the answer is traditional, where `zh` does not.
 *
 *  Blank and non-string fall back to `en` because this one IS rendered mid-sentence, where an
 *  empty string reads as a broken template rather than as the fallback it is. */
export function browserLanguageTag(): string {
  const tag = navigator.language;
  return typeof tag === "string" && tag.trim() !== "" ? tag : "en";
}

/** What to actually render in. A browser we have no bundle for falls back to English rather than
 *  to keys. */
export function resolveUiLocale(language: UiLanguage): UiLocale {
  if (language !== UI_LANGUAGE_AUTO) return language;
  const browser = browserUiLocale();
  return isUiLocale(browser) ? browser : "en";
}
