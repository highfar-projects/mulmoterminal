import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsModal from "../../../../src/components/SettingsModal.vue";
import LanguageSection from "../../../../src/components/settings/LanguageSection.vue";
import { i18n } from "../../../../src/i18n";
import { en } from "../../../../src/i18n/en";
import { ja } from "../../../../src/i18n/ja";
import { UI_LANGUAGE_AUTO, UI_LOCALES, browserLanguageTag, parseUiLanguage, resolveUiLocale, uiLanguage } from "../../../../src/composables/uiLanguage";
import type { UiLocale } from "../../../../src/composables/uiLanguage";

// The picker writes `uiLanguage`, and the runtime follows it — the modal must not be reading the
// setting a second way, or a language change would move some of the screen and not the rest.
describe("Settings language picker", () => {
  afterEach(() => {
    uiLanguage.value = "en";
    vi.unstubAllGlobals();
  });

  it("switches the whole modal, sidebar included, when a language is picked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    const w = mount(SettingsModal);
    await flushPromises();
    expect(w.get('[data-testid="settings-tab-sounds"]').text()).toBe(en.settings.tabs.sounds);
    expect(w.get('[data-testid="settings-pane"]').text()).toContain(en.settings.tabs.theme);

    await mount(LanguageSection).get("select").setValue("ja");
    await flushPromises();
    expect(w.get('[data-testid="settings-tab-sounds"]').text()).toBe(ja.settings.tabs.sounds);
    expect(w.get('[data-testid="settings-pane"]').text()).toContain(ja.settings.tabs.theme);
  });

  it("persists the pick, and reads back only a language it has a bundle for", async () => {
    await mount(LanguageSection).get("select").setValue("ja");
    expect(localStorage.getItem("ui_language")).toBe("ja");
    expect(parseUiLanguage("ja")).toBe("ja");
    // A bundle that has since been removed, or a hand-edited value, must not reach vue-i18n —
    // there it would resolve to no messages at all rather than to English.
    expect(parseUiLanguage("kl")).toBe(UI_LANGUAGE_AUTO);
    expect(parseUiLanguage(null)).toBe(UI_LANGUAGE_AUTO);
  });

  // `auto` is the default, and it has to survive a browser the app has no bundle for.
  it.each([
    ["ja-JP", "ja"],
    ["ja", "ja"],
    ["en-GB", "en"],
    ["kl-GL", "en"],
    ["ko-KR", "ko"],
    ["ko", "ko"],
    // The Chinese rows are the point of reading the WHOLE tag: `browserLocale()` answers `zh` for
    // every one of these, and the two bundles are not interchangeable. Hong Kong and Macau write
    // the traditional script, so a check written as "Taiwan vs. everyone else" drops them.
    ["zh-CN", "zh-CN"],
    ["zh", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-Hans-CN", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["zh-Hant-TW", "zh-TW"],
    // Script beats region, both ways round. A region-only rule gets both of these backwards.
    ["zh-Hans-HK", "zh-CN"],
    ["zh-Hant-CN", "zh-TW"],
    // Chinese is written by more languages than `zh`, and these are why the script is asked of
    // `Intl.Locale` rather than matched here: not one of them starts with `zh`, and a list that
    // named the regions above would have named none of them. `yue` is the reachable one — macOS
    // and iOS offer Cantonese as its own language.
    ["yue", "zh-TW"],
    ["yue-HK", "zh-TW"],
    ["yue-Hans", "zh-CN"],
    ["cmn-Hant-TW", "zh-TW"],
    ["cmn-Hans-CN", "zh-CN"],
    ["nan-TW", "zh-TW"],
    ["hak-TW", "zh-TW"],
    ["wuu", "zh-CN"],
    // A unicode extension must not defeat the match, and case must not matter.
    ["zh-TW-u-ca-roc", "zh-TW"],
    ["ZH-HANT-TW", "zh-TW"],
    // RFC 5646's extlang forms are valid BCP 47 but are NOT Unicode locale ids, so parsing the
    // whole tag throws and the retry answers. `zh-yue` is the row that PROVES the retry reaches
    // the extlang: its canonical form is `yue`, which is Cantonese and traditional, so a retry
    // that reached the PREFIX instead would answer zh-CN here. The other extlang forms all agree
    // with plain `zh`, so they would stay green either way and prove nothing on their own.
    ["zh-yue", "zh-TW"],
    ["zh-cmn", "zh-CN"],
    // Chinese written in neither Han script. We ship no romanized bundle, and English serves a
    // Chinese reader worse than either Chinese bundle does, so the REGION decides — which is the
    // only thing that gets zhuyin (Taiwanese) and pinyin (mainland) the right way round.
    ["zh-Latn", "zh-CN"],
    ["zh-Bopo", "zh-TW"],
    ["zh-Hanb", "zh-TW"],
    ["yue-Latn", "zh-TW"],
    // This is the row that distinguishes asking CLDR from keeping a set of traditional-writing
    // regions here. A set of {TW, HK, MO} answers simplified for the diaspora; CLDR calls Chinese
    // in the US, the UK and Thailand traditional, and deferring to it is the point.
    ["zh-Latn-US", "zh-TW"],
    // The script must never be read without the language. `maximize()` keeps an explicit script
    // whatever the language, so each of these is a well-formed tag that comes back Hans or Hant
    // while having nothing to do with Chinese — reading the script alone renders the UI in
    // Chinese for an English browser.
    ["en-Hant", "en"],
    ["fr-Hant", "en"],
    ["de-Hans", "en"],
    ["ja-Hant", "ja"],
    ["ko-Hans", "ko"],
  ])("resolves auto on a %s browser to %s", (language, expected) => {
    vi.stubGlobal("navigator", { language });
    expect(resolveUiLocale(UI_LANGUAGE_AUTO)).toBe(expected);
  });

  // `browserUiLocale` runs inside `createI18n`, so anything it throws happens before the app
  // mounts — a blank screen rather than a wrong language. `Intl.Locale` rejects every one of
  // these, so the guard around it is what keeps them boring.
  it.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["an underscore instead of a hyphen", "zh_TW"],
    ["not a tag at all", "not a tag"],
    ["a lone region subtag", "-US"],
    ["a non-string, as a stub can supply", 42],
    ["undefined", undefined],
  ])("falls back to English rather than throwing on %s", (_why, language) => {
    vi.stubGlobal("navigator", { language });
    expect(() => resolveUiLocale(UI_LANGUAGE_AUTO)).not.toThrow();
    expect(resolveUiLocale(UI_LANGUAGE_AUTO)).toBe("en");
    // The tag the Settings line prints is asserted separately and on a weaker property. Echoing
    // an unparseable tag back is correct there — "your browser asks for zh_TW" is the truth and
    // it is useful. What must never reach that sentence is a blank, which reads as a broken
    // template rather than as the fallback it is.
    expect(browserLanguageTag().trim()).not.toBe("");
  });

  it("says what auto currently resolves to, rather than leaving it to be guessed", async () => {
    vi.stubGlobal("navigator", { language: "ja-JP" });
    uiLanguage.value = UI_LANGUAGE_AUTO;
    const w = mount(LanguageSection);
    await flushPromises();
    // The bare subtag, not `ja-JP`: `browserLocale()` drops the region on purpose (en-GB and en-US
    // want one bundle), and this line has to say the value the app actually resolved.
    expect(w.text()).toContain("ja");
    expect(w.text()).toContain("日本語");
  });

  // English is the fallback, so an untranslated key renders English words. That is only true while
  // each bundle is complete — the moment one isn't, half a pane silently reverts and nothing fails.
  //
  // Driven off UI_LOCALES rather than a list written here, so adding a bundle is covered by the
  // act of registering it. The `Messages` type already makes a MISSING key a compile error; this
  // catches the other half — a key the type accepts but vue-i18n cannot resolve, which is what a
  // locale code spelled one way in UI_LOCALES and another in `messages` produces.
  it.each(UI_LOCALES.filter((locale) => locale.code !== "en").map((locale) => locale.code))("translates every key the English bundle declares: %s", (code) => {
    const missing: string[] = [];
    const walk = (english: unknown, path: string) => {
      if (typeof english === "string") {
        if (!i18n.global.te(path, code)) missing.push(path);
        return;
      }
      if (english && typeof english === "object") {
        Object.entries(english).forEach(([key, value]) => walk(value, `${path}${path ? "." : ""}${key}`));
      }
    };
    walk(en, "");
    expect(missing).toEqual([]);
  });

  // The sentence is "your browser asks for X, so this reads as Y", so X has to be what the
  // BROWSER sent. Filling it with the locale we resolved TO is circular on a zh-CN browser and
  // outright false whenever the resolution crossed languages: a Cantonese browser was being told
  // it had asked for zh-TW. Y carries the resolution; X must not.
  it.each([
    ["yue-HK", "繁體中文"],
    ["nan-TW", "繁體中文"],
    ["cmn-Hans-CN", "简体中文"],
    ["zh-Hant-TW", "繁體中文"],
    ["ja-JP", "日本語"],
  ])("tells a %s browser what IT asked for, not what that resolved to", async (language, label) => {
    vi.stubGlobal("navigator", { language });
    uiLanguage.value = UI_LANGUAGE_AUTO;
    const text = mount(LanguageSection).text();
    expect(text).toContain(language);
    expect(text).toContain(label);
  });

  // A stepper renders `{{ value }}{{ unit }}` with nothing between them, so the unit string carries
  // its own spacing and each script wants a different answer: Chinese sets a numeral solid against
  // its unit, Korean orthography separates a unit noun, and English needs the space it would have
  // in a sentence. Nothing asserted this, and both Chinese bundles shipped an English-shaped space.
  const STEPPER_UNITS: [UiLocale, string, string][] = [
    ["en", "2 days", "2 hours"],
    ["ja", "2 日", "2 時間"],
    ["zh-CN", "2天", "2小时"],
    ["zh-TW", "2天", "2小時"],
    ["ko", "2 일", "2 시간"],
  ];
  it.each(STEPPER_UNITS)("renders the %s stepper units the way that script sets them", (locale, reap, sweep) => {
    expect(`2${i18n.global.t("settings.surviving.reapUnit", {}, { locale })}`).toBe(reap);
    expect(`2${i18n.global.t("settings.surviving.sweepUnit", {}, { locale })}`).toBe(sweep);
  });

  // The picker is the only way to reach a bundle that `auto` would not pick, so a bundle missing
  // from it is one nobody can choose.
  it("offers every bundle that exists", async () => {
    const options = mount(LanguageSection)
      .findAll("option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual([UI_LANGUAGE_AUTO, ...UI_LOCALES.map((locale) => locale.code)]);
  });
});

// #2204. The picker's endonyms already work for somebody who knows the name of their own
// language. This is the other reader: the one who picked a language they cannot read and has to
// find the way back through a screen written entirely in it.
describe("the way back from a language you cannot read", () => {
  afterEach(() => {
    uiLanguage.value = "en";
    vi.unstubAllGlobals();
  });

  const mountModal = async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    const w = mount(SettingsModal);
    await flushPromises();
    return w;
  };

  // THE one that matters, and the one a list of translated strings cannot give you: the row has
  // to be findable in a sidebar of ~28 entries none of which this reader can read.
  it("names the language row in English too, in every locale that is not English", async () => {
    for (const locale of UI_LOCALES.filter((l) => l.code !== "en")) {
      uiLanguage.value = locale.code;
      const w = await mountModal();
      expect(w.get('[data-testid="settings-tab-language"]').text()).toContain("Language");
      w.unmount();
    }
  });

  // And it is the ONLY row that does. This is an exit, not a policy of bilingual labels — if the
  // whole sidebar carried English the exit would stop standing out, which is the whole of its job.
  it("leaves every other row in the language that was picked", async () => {
    uiLanguage.value = "ja";
    const w = await mountModal();
    expect(w.get('[data-testid="settings-tab-sounds"]').text()).toBe(ja.settings.tabs.sounds);
    expect(w.get('[data-testid="settings-tab-theme"]').text()).toBe(ja.settings.tabs.theme);
  });

  it("puts English beside every language in the picker", async () => {
    uiLanguage.value = "ko";
    // The runtime follows `uiLanguage` through a watcher, so the locale is not on the new value
    // until the queue drains — mounting before that renders the ENGLISH screen and the assertion
    // passes for the wrong reason.
    await flushPromises();
    const options = mount(LanguageSection).findAll("option");
    const text = options.map((o) => o.text()).join(" | ");
    for (const locale of UI_LOCALES) expect(text).toContain(locale.english);
  });

  // `auto` is the default, so the reader who wants back to "whatever my browser says" is the
  // likeliest one of all to be stranded — and its label is the one string here with no endonym.
  it("puts English beside the browser-language option", async () => {
    uiLanguage.value = "ko";
    await flushPromises();
    const auto = mount(LanguageSection)
      .findAll("option")
      .find((o) => o.attributes("value") === UI_LANGUAGE_AUTO);
    expect(auto?.text()).toContain(en.settings.language.auto);
  });

  // An English screen must not say anything twice — `English (English)` would make the entry an
  // English reader is scanning for the noisiest line in the list.
  it("adds nothing when the screen is already English", async () => {
    uiLanguage.value = "en";
    const w = await mountModal();
    expect(w.get('[data-testid="settings-tab-language"]').text()).toBe(en.settings.tabs.language);
    expect(
      mount(LanguageSection)
        .findAll("option")
        .map((o) => o.text()),
    ).not.toContain("English (English)");
  });
});
