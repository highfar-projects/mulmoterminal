// @vitest-environment node
// The dated setup guides are what the What's new dialog shows after an upgrade, so they are the
// release notes a user actually reads. From the first release after this rule, each one has to sort
// its content under the same three headings in both languages, and mention every pull request the
// changelog lists for that version, so nothing a user can notice is left out of the dialog.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compareVersions } from "../../common/whatsNew";
import { toWhatsNewEntry } from "../../server/whatsNew/guidePage.js";

// Pages up to this version were written before the rule and are dated snapshots; they are not rewritten.
const LAST_GUIDE_BEFORE_RULE = "7.1.0";

const REQUIRED_HEADINGS = {
  en: ["## New features", "## What looks different", "## Under the hood"],
  ja: ["## 新機能", "## 画面の変化", "## 見えない変化"],
} as const;

const GUIDE_ROOT = path.join(process.cwd(), "docs", "guide");
const GUIDE_FILE = /^v(\d+\.\d+\.\d+)\.md$/;

const releasedVersions = (language: "en" | "ja"): string[] =>
  readdirSync(path.join(GUIDE_ROOT, language)).flatMap((name) => GUIDE_FILE.exec(name)?.slice(1, 2) ?? []);

const readGuide = (language: "en" | "ja", version: string): string => readFileSync(path.join(GUIDE_ROOT, language, `v${version}.md`), "utf-8");

const changelog = readFileSync(path.join(process.cwd(), "docs", "ChangeLog.md"), "utf-8");

/** The pull requests the changelog lists under `## mulmoterminal@<version>`. */
function changelogPullRequests(version: string): string[] {
  const start = changelog.indexOf(`## mulmoterminal@${version} `);
  if (start < 0) return [];
  const next = changelog.indexOf("\n## ", start + 1);
  const section = changelog.slice(start, next < 0 ? undefined : next);
  return [...new Set([...section.matchAll(/\/pull\/(\d+)/g)].map((match) => match[1]))];
}

/** What a page breaks of the rule: missing headings, and changelog PRs it never mentions. */
function ruleViolations(language: "en" | "ja", page: string, pullRequests: readonly string[]): string[] {
  const lines = page.split("\n");
  const missingHeadings = REQUIRED_HEADINGS[language].filter((heading) => !lines.includes(heading)).map((heading) => `missing "${heading}"`);
  const unmentioned = pullRequests.filter((number) => !page.includes(`#${number}`)).map((number) => `never mentions #${number}`);
  return [...missingHeadings, ...unmentioned];
}

const ruledVersions = releasedVersions("en").filter((version) => compareVersions(version, LAST_GUIDE_BEFORE_RULE) > 0);

describe("dated setup guides", () => {
  it("every release page has a title the dialog can show", () => {
    (["en", "ja"] as const).forEach((language) => {
      releasedVersions(language).forEach((version) => {
        const entry = toWhatsNewEntry(readGuide(language, version), language, version);
        expect(entry.title, `${language}/v${version}.md has no front-matter title`).not.toBe(version);
        expect(entry.markdown.length, `${language}/v${version}.md is empty`).toBeGreaterThan(0);
      });
    });
  });

  it("every page after the rule has both languages, the three headings and every changelog PR", () => {
    ruledVersions.forEach((version) => {
      expect(releasedVersions("ja"), `docs/guide/ja/v${version}.md is missing`).toContain(version);
      const pullRequests = changelogPullRequests(version);
      (["en", "ja"] as const).forEach((language) => {
        expect(ruleViolations(language, readGuide(language, version), pullRequests), `${language}/v${version}.md`).toEqual([]);
      });
    });
  });
});

describe("the rule check itself", () => {
  const goodJa = ["## 新機能", "- 何か (#101)", "## 画面の変化", "なし", "## 見えない変化", "- 直した (#102)"].join("\n");

  it("passes a page that follows the rule", () => {
    expect(ruleViolations("ja", goodJa, ["101", "102"])).toEqual([]);
  });

  it("names a missing heading", () => {
    expect(ruleViolations("ja", goodJa.replace("## 画面の変化", "## 画面"), ["101"])).toEqual(['missing "## 画面の変化"']);
  });

  it("names a changelog PR the page leaves out", () => {
    expect(ruleViolations("ja", goodJa, ["101", "103"])).toEqual(["never mentions #103"]);
  });

  it("does not take the English headings for the Japanese ones", () => {
    const english = ["## New features", "## What looks different", "## Under the hood"].join("\n");
    expect(ruleViolations("ja", english, [])).toHaveLength(3);
    expect(ruleViolations("en", english, [])).toEqual([]);
  });

  it("reads the PRs of one changelog section only", () => {
    expect(changelogPullRequests(LAST_GUIDE_BEFORE_RULE)).toContain("2591");
    expect(changelogPullRequests(LAST_GUIDE_BEFORE_RULE)).not.toContain("2536");
    expect(changelogPullRequests("0.0.0")).toEqual([]);
  });
});
