import { describe, it, expect } from "vitest";
import { createI18n } from "vue-i18n";
import { failureText } from "../../../../src/components/blueprints/refusalText";
import { checkOutputText } from "../../../../src/components/blueprints/stepNoticeText";
import { englishStepNotice, stepNoticeSchema, type StepNotice, type StepNoticeCode } from "../../../../common/blueprint/stepNotice";
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
  "no-parent": { code: "no-parent", dir: "/Users/me/missing" },
  "folder-taken": { code: "folder-taken", dir: "/Users/me/work/keihi" },
  untrusted: { code: "untrusted", dir: "/Users/me/work" },
  "folder-busy": { code: "folder-busy", dir: "/Users/me/work", runId: "run-00000007" },
  "samples-clash": { code: "samples-clash", files: ["contract.txt", "memo.md"] },
  "held-elsewhere": { code: "held-elsewhere", port: "34567" },
  "revision-pending": { code: "revision-pending" },
  "spec-not-at-review": { code: "spec-not-at-review" },
  "message-pending": { code: "message-pending" },
  "agent-working": { code: "agent-working" },
  "registry-url-not-allowed": { code: "registry-url-not-allowed", urls: ["http://example.com/r.json", "file:///tmp/r.json"] },
  "registry-unknown": { code: "registry-unknown", url: "https://example.com/r.json" },
  "pack-not-listed": { code: "pack-not-listed", url: "https://example.com/r.json", slug: "acme-tool" },
  "pack-busy": { code: "pack-busy", slug: "acme-tool" },
  "pack-not-installed": { code: "pack-not-installed", slug: "acme-tool" },
  "pack-builtin": { code: "pack-builtin", slug: "review" },
  "pack-local-repo": { code: "pack-local-repo", repo: "file:///tmp/acme" },
  "pack-broken": { code: "pack-broken", detail: "no readable manifest.json at the repository root" },
  "install-failed": { code: "install-failed", detail: "git clone: could not resolve host" },
};

const NOTICES: Record<StepNoticeCode, StepNotice> = {
  "folder-busy": { code: "folder-busy", runId: "run-00000007" },
  untrusted: { code: "untrusted", dir: "/Users/me/work" },
  "answers-unwritten": { code: "answers-unwritten", detail: "EACCES: permission denied" },
  "session-lost": { code: "session-lost" },
  "round-limit": { code: "round-limit", rounds: 5 },
};

const LOCALES = { en, ja, ko, "zh-CN": zhCN, "zh-TW": zhTW };

// No fallback locale: a key missing from one bundle comes back as the key, not as English.
function translatorFor(locale: keyof typeof LOCALES): (key: string, values: Record<string, string>) => string {
  const i18n = createI18n({ legacy: false, locale, messages: { [locale]: LOCALES[locale] }, missingWarn: false, fallbackWarn: false });
  return (key, values) => i18n.global.t(key, values);
}

const valuesIn = (refusal: Refusal | StepNotice): string[] =>
  Object.entries(refusal).flatMap(([key, value]) => (key === "code" ? [] : [value].flat().map(String)));

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

describe("checkOutputText", () => {
  describe.each(Object.keys(LOCALES) as (keyof typeof LOCALES)[])("in %s", (locale) => {
    const t = translatorFor(locale);
    it.each(Object.values(NOTICES))("words the executor's $code with every value it carries", (notice) => {
      const text = checkOutputText(t, { ok: false, output: englishStepNotice(notice), atMs: 1, notice });
      expect(text).not.toMatch(/^blueprints\./);
      expect(text).not.toMatch(/[{}]/);
      if (locale !== "en") expect(text).not.toBe(englishStepNotice(notice));
      valuesIn(notice).forEach((value) => expect(text).toContain(value));
    });
  });

  it("shows a pack's check output as it is", () => {
    expect(checkOutputText(translatorFor("ja"), { ok: false, output: "3 problems left", atMs: 1 })).toBe("3 problems left");
  });

  it.each(Object.values(NOTICES))("keeps the English of $code for the agent, naming every value, and survives the wire", (notice) => {
    valuesIn(notice).forEach((value) => expect(englishStepNotice(notice)).toContain(value));
    expect(stepNoticeSchema.parse(JSON.parse(JSON.stringify(notice)))).toEqual(notice);
  });
});
