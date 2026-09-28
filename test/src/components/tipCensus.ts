// The census every translated tip surface runs (#2408): read the component sources, and check
// the `tips.<section>` keys they name against the REAL bundles — a stub that echoes the key back
// would make every wrong key correct, the reason attentionStatusWords.spec.ts reads them too.
import { describe, it, expect } from "vitest";
import { isRecord } from "../../../common/isRecord";
import { en } from "../../../src/i18n/en";
import { ja } from "../../../src/i18n/ja";
import { zhCN } from "../../../src/i18n/zh-CN";
import { zhTW } from "../../../src/i18n/zh-TW";
import { ko } from "../../../src/i18n/ko";

const BUNDLES = { en, ja, "zh-CN": zhCN, "zh-TW": zhTW, ko };

type TipSection = keyof typeof en.tips;

const lookUp = (bundle: unknown, key: string): unknown => key.split(".").reduce<unknown>((node, part) => (isRecord(node) ? node[part] : undefined), bundle);

const leafKeys = (node: unknown, prefix: string): string[] => {
  if (typeof node === "string") return [prefix];
  return isRecord(node) ? Object.entries(node).flatMap(([key, child]) => leafKeys(child, `${prefix}.${key}`)) : [];
};

/** The `{name}` placeholders a message fills, sorted — what a translation must keep. */
const placeholders = (message: unknown): string[] =>
  typeof message === "string" ? [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort() : [];

// An English literal where a message belongs: a plain attribute, or a quoted capitalised string
// inside a bound one (`:data-tip="x ? 'Foo' : …"`). Lower-case literals such as the
// `'git push -u origin'` command are not words to translate.
export const HARDCODED_TIP = /(?:^|\s)(?:data-tip|aria-label)="[^"]+"|:(?:data-tip|aria-label)="[^"]*(?:'[A-Z]|`[A-Z])/g;

/** Every `tips.<section>.…` string literal the sources name, whether passed to t() or kept in a table. */
const namedKeys = (section: TipSection, sources: Record<string, string>): string[] => {
  const pattern = new RegExp(`["'](tips\\.${section}\\.[\\w.]+)["']`, "g");
  return [...new Set(Object.values(sources).flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1] ?? "")))];
};

/** The checks for one surface: `sources` maps a file name to its text (imported with `?raw`). */
export function describeTipSurface(section: TipSection, sources: Record<string, string>): void {
  describe(`the ${section} tips and aria-labels`, () => {
    it("name keys at all, so the census below is reading the right files", () => {
      expect(namedKeys(section, sources).length).toBeGreaterThan(0);
    });

    it.each(Object.entries(BUNDLES))("resolve every named key in %s", (_locale, bundle) => {
      expect(namedKeys(section, sources).filter((key) => typeof lookUp(bundle, key) !== "string")).toEqual([]);
    });

    // A translation that drops or renames a placeholder shows a raw `{path}` or loses the value.
    it.each(Object.entries(BUNDLES).filter(([locale]) => locale !== "en"))("keep every placeholder in %s", (_locale, bundle) => {
      const differing = leafKeys(en.tips[section], `tips.${section}`).filter(
        (key) => placeholders(lookUp(bundle, key)).join() !== placeholders(lookUp(en, key)).join(),
      );
      expect(differing).toEqual([]);
    });

    it("leave no English key unused", () => {
      const named = new Set(namedKeys(section, sources));
      expect(leafKeys(en.tips[section], `tips.${section}`).filter((key) => !named.has(key))).toEqual([]);
    });

    it.each(Object.entries(sources).filter(([file]) => file.endsWith(".vue")))("keep no English written into %s", (_file, text) => {
      expect(text.match(HARDCODED_TIP) ?? []).toEqual([]);
    });
  });
}
