import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsModal from "../../../../src/components/SettingsModal.vue";
import LanguageSection from "../../../../src/components/settings/LanguageSection.vue";
import { i18n } from "../../../../src/i18n";
import { en } from "../../../../src/i18n/en";
import { ja } from "../../../../src/i18n/ja";
import { UI_LANGUAGE_AUTO, UI_LOCALES, browserUiLocale, parseUiLanguage, resolveUiLocale, uiLanguage } from "../../../../src/composables/uiLanguage";

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
    // RFC 5646's deprecated extlang forms are valid BCP 47 but are NOT Unicode locale ids, so
    // parsing the whole tag throws and the bare subtag is what answers.
    ["zh-yue", "zh-CN"],
    ["zh-cmn", "zh-CN"],
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
    // `browserUiLocale` is asserted SEPARATELY, and on a WEAKER property, because it is what the
    // Settings line prints. Echoing an unparseable tag back is correct there — "your browser asks
    // for zh_TW" is the truth and it is useful. What must never reach that sentence is a blank,
    // which reads as a broken template rather than as the fallback it is.
    expect(browserUiLocale().trim()).not.toBe("");
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

  // The picker is the only way to reach a bundle that `auto` would not pick, so a bundle missing
  // from it is one nobody can choose.
  it("offers every bundle that exists", async () => {
    const options = mount(LanguageSection)
      .findAll("option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual([UI_LANGUAGE_AUTO, ...UI_LOCALES.map((locale) => locale.code)]);
  });
});
