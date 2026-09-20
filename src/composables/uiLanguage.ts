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
 *  other. Labels are endonyms — what a speaker calls their own language is what they scan for.
 *
 *  `english` is the second handle on the same entry, for the reader who does NOT know the name of
 *  the language they want back (#2204). It is written here rather than in the bundles because it
 *  is the same word in all five of them, and five copies of one word is five places to forget when
 *  a sixth locale lands. `en` carries its own name so the pair can be compared rather than
 *  special-cased — see `withEnglish`. */
export const UI_LOCALES = [
  { code: "en", label: "English", english: "English" },
  { code: "ja", label: "日本語", english: "Japanese" },
  { code: "zh-CN", label: "简体中文", english: "Chinese, Simplified" },
  { code: "zh-TW", label: "繁體中文", english: "Chinese, Traditional" },
  { code: "ko", label: "한국어", english: "Korean" },
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

/** Which script CLDR expects for a locale's LANGUAGE in its REGION, ignoring the script the tag
 *  itself named. Asked instead of keeping a set of traditional-writing regions here, because a set
 *  of three would have been wrong about the diaspora: CLDR calls `zh-US`, `zh-GB` and `zh-TH`
 *  traditional, and a hand-written `{TW, HK, MO}` calls them simplified. */
const scriptInRegion = (locale: Intl.Locale): string | undefined =>
  locale.region === undefined ? undefined : new Intl.Locale(`${locale.language}-${locale.region}`).maximize().script;

/** RFC 5646's extlang: exactly three letters in second position, and its canonical form REPLACES
 *  the prefix — `zh-yue` canonicalises to `yue`, not to `zh`. Nothing else can sit there as three
 *  LETTERS: a script is four letters, a region is two letters or three digits, and a variant is
 *  five to eight alphanumerics or else four characters beginning with a digit (`de-1901`). */
const EXTLANG = /^[a-z]{2,3}-([a-z]{3})(-|$)/i;

/** What to retry when a whole tag will not parse. The extlang when there is one, because dropping
 *  it loses the language: `zh-yue` IS Cantonese, and reading it as plain `zh` silently answers
 *  simplified for a reader whose script is traditional. */
const retryTag = (tag: string): string => EXTLANG.exec(tag)?.[1] ?? browserLocale();

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
    // The language is Chinese, so the answer is one of the two bundles and the only question left
    // is which script. The tag's own script answers it when it is a Han one; when it is not —
    // `zh-Latn` is pinyin, `zh-Bopo` is zhuyin, `yue-Latn` is jyutping — the region does, because
    // we ship no romanized bundle and English serves a Chinese reader worse than either Chinese
    // bundle does. That is what gets zhuyin (Taiwanese) and pinyin (mainland) the right way round.
    const script = isHanScript(maximized.script) ? maximized.script : scriptInRegion(maximized);
    return script === "Hant" ? "zh-TW" : "zh-CN";
  } catch {
    // Not a Unicode locale id — UTS 35 has no extlangs, so RFC 5646's `zh-yue` form throws here
    // even though it is valid BCP 47. The caller retries; `retryTag` is what makes that retry
    // reach the extlang rather than the prefix.
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
 *  The second `chineseScriptLocale` call can only ever change the answer for a tag that would not
 *  PARSE — RFC 5646's extlang forms. For any tag that parses, what `retryTag` hands back is that
 *  tag's own language, and the language is what the first call already judged. */
function browserUiLocale(): string {
  const tag = navigator.language;
  // A NON-STRING is the one input that has to be stopped here, and not because `Intl.Locale`
  // throws on it — that throw is caught. It is `browserLocale()` further down, which calls
  // `.split()` and would raise an uncaught TypeError on the createI18n boot path. Blank and
  // unparseable strings need no guard: they reach `resolveUiLocale`, miss every bundle, and land
  // on English. A `tag.trim() === ""` here was dead weight, and removing it turned no test red.
  if (typeof tag !== "string") return "en";
  // A blank or unparseable answer needs no guard here — `resolveUiLocale` matches it against the
  // bundles and lands on English. Only the DISPLAY of a tag has to be non-blank, and that is
  // `browserLanguageTag`'s job now.
  return chineseScriptLocale(tag) ?? chineseScriptLocale(retryTag(tag)) ?? browserLocale();
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
