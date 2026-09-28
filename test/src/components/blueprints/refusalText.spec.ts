import { describe, it, expect } from "vitest";
import { createI18n } from "vue-i18n";
import { failureText } from "../../../../src/components/blueprints/refusalText";
import { englishRefusal, refusalSchema, type Refusal, type RefusalCode } from "../../../../common/blueprint/refusal";
import { en } from "../../../../src/i18n/en";
import { ja } from "../../../../src/i18n/ja";
import { ko } from "../../../../src/i18n/ko";
import { zhCN } from "../../../../src/i18n/zh-CN";
import { zhTW } from "../../../../src/i18n/zh-TW";

// One of each, so a new code without a sample here is a type error.
const SAMPLES: Record<RefusalCode, Refusal> = {
  "not-absolute": { code: "not-absolute" },
  "not-a-directory": { code: "not-a-directory", dir: "/Users/me/notes.txt" },
  untrusted: { code: "untrusted", dir: "/Users/me/work" },
  "folder-busy": { code: "folder-busy", dir: "/Users/me/work", runId: "run-00000007" },
  "samples-clash": { code: "samples-clash", files: ["contract.txt", "memo.md"] },
  "held-elsewhere": { code: "held-elsewhere", port: "34567" },
  "revision-pending": { code: "revision-pending" },
};

const LOCALES = { en, ja, ko, "zh-CN": zhCN, "zh-TW": zhTW };

// No fallback locale: a key missing from one bundle comes back as the key, not as English.
function translatorFor(locale: keyof typeof LOCALES): (key: string, values: Record<string, string>) => string {
  const i18n = createI18n({ legacy: false, locale, messages: { [locale]: LOCALES[locale] }, missingWarn: false, fallbackWarn: false });
  return (key, values) => i18n.global.t(key, values);
}

const valuesIn = (refusal: Refusal): string[] => Object.entries(refusal).flatMap(([key, value]) => (key === "code" ? [] : [value].flat()));

describe("failureText", () => {
  describe.each(Object.keys(LOCALES) as (keyof typeof LOCALES)[])("in %s", (locale) => {
    const t = translatorFor(locale);
    it.each(Object.values(SAMPLES))("words $code with every value it carries", (refusal) => {
      const text = failureText(t, { error: "server English", refusal });
      expect(text).not.toMatch(/^blueprints\./);
      expect(text).not.toMatch(/[{}]/);
      expect(text).not.toBe("server English");
      valuesIn(refusal).forEach((value) => expect(text).toContain(value));
    });
  });

  it("shows the server's English when the failure carries no refusal", () => {
    expect(failureText(translatorFor("ja"), { error: "no blueprint run run-9" })).toBe("no blueprint run run-9");
  });
});

describe("englishRefusal", () => {
  it.each(Object.values(SAMPLES))("names every value of $code, and the refusal survives the wire", (refusal) => {
    const text = englishRefusal(refusal);
    valuesIn(refusal).forEach((value) => expect(text).toContain(value));
    expect(refusalSchema.parse(JSON.parse(JSON.stringify(refusal)))).toEqual(refusal);
  });

  it("rejects an unknown code or a missing value, so the UI falls back to the English", () => {
    expect(refusalSchema.safeParse({ code: "no-such-code" }).success).toBe(false);
    expect(refusalSchema.safeParse({ code: "untrusted" }).success).toBe(false);
    expect(refusalSchema.safeParse(undefined).success).toBe(false);
  });
});
