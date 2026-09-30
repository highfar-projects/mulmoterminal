// @vitest-environment node
// Two versions of a document, article by article. Whether an article changed is decided here by comparing text, so
// these are the rules that stop a comparison table from calling a changed article unchanged, or the reverse.
import { describe, expect, it } from "vitest";
import { articlesIn, comparisonProblems, mentions, sectionText, type Article } from "../../../blueprints/compare/checks/articles.mjs";
import { comparisonText } from "../../../blueprints/compare/checks/comparisonView.mjs";
import { articleTree } from "./articleTree";

const OLD = "契約書\n\n第1条（目的）\n委託する。\n\n第2条（報酬）\n月額200,000円を払う。\n\n第3条（期間）\n1年とする。\n";
const NEW = "契約書\n\n第1条（目的）\n委託 する。\n\n第2条（報酬）\n月額220,000円を払う。\n\n第3条（報告）\n毎月報告する。\n\n第4条（期間）\n1年とする。\n";
const olds = articlesIn(articleTree(OLD), OLD);
const news = articlesIn(articleTree(NEW), NEW);
const GOOD = [
  { old: "1", new: "1", change: "same" },
  { old: "2", new: "2", change: "changed", what: "200,000円が220,000円に" },
  { old: null, new: "3", change: "added", what: "報告の条" },
  { old: "3", new: "4", change: "same" },
];

describe("the articles of a version", () => {
  it("are read from the tree's spans, their bodies without their own number and spacing", () => {
    expect(olds.map((article: Article) => [article.address, article.label])).toEqual([
      ["1", "第1条"],
      ["2", "第2条"],
      ["3", "第3条"],
    ]);
    expect(olds[0]?.body).toBe("（目的）委託する。");
  });

  it("read a renumbered article the same, and a reflowed line the same", () => {
    expect(olds[2]?.body).toBe(news[3]?.body);
    expect(olds[0]?.body).toBe(news[0]?.body);
  });

  it("are none for a tree without articles, or no tree", () => {
    expect(articlesIn({ kind: "doc", children: [{ kind: "section", address: "h1", span: { start: 0, end: 3 } }] }, "abc")).toEqual([]);
    expect(articlesIn(null, "abc")).toEqual([]);
  });
});

describe("a pairing of the two versions", () => {
  it("passes when every article is in one row and each row says the truth", () => {
    expect(comparisonProblems(GOOD, olds, news)).toEqual([]);
  });

  it.each<[string, unknown, string]>([
    ["no rows", undefined, 'needs a "rows" list'],
    ["a row that is not an object", [...GOOD, "x"], "row 5 is not an object"],
    ["an unknown change", [{ ...GOOD[0], change: "moved" }, ...GOOD.slice(1)], '"change" must be one of'],
    ["a change with nothing said", [GOOD[0], { ...GOOD[1], what: " " }, ...GOOD.slice(2)], 'say in "what" what changed'],
    ["an added row with an old article", [...GOOD.slice(0, 2), { ...GOOD[2], old: "3" }, GOOD[3]], 'a "added" row has no "old"'],
    ["a removed row with a new article", [...GOOD, { old: "3", new: "4", change: "removed" }], 'a "removed" row has an "old" and no "new"'],
    ["a same row with one side", [{ old: "1", new: null, change: "same" }, ...GOOD.slice(1)], 'a "same" row has an "old" and a "new"'],
  ])("refuses %s", (_label, rows, message) => {
    expect(comparisonProblems(rows, olds, news).join("\n")).toContain(message);
  });

  it("refuses 'same' over a changed article, and 'changed' over an unchanged one", () => {
    expect(comparisonProblems([GOOD[0], { old: "2", new: "2", change: "same" }, GOOD[2], GOOD[3]], olds, news)).toEqual([
      '第2条 → 第2条: written "same", but the text differs',
    ]);
    expect(comparisonProblems([{ old: "1", new: "1", change: "changed", what: "x" }, ...GOOD.slice(1)], olds, news)).toEqual([
      '第1条 → 第1条: written "changed", but the text is the same',
    ]);
  });

  it("refuses an article left out, one in two rows, and one that is not there", () => {
    expect(comparisonProblems(GOOD.slice(0, 3), olds, news)).toEqual(["the old version 第3条: in no row", "the new version 第4条: in no row"]);
    expect(comparisonProblems([...GOOD, { old: "1", new: "4", change: "changed", what: "x" }], olds, news).join("\n")).toContain(
      "the old version 第1条: in more than one row",
    );
    expect(comparisonProblems([...GOOD, { old: null, new: "9", change: "added" }], olds, news)).toEqual(["the new version has no article at 9"]);
  });
});

describe("the pairing a person reads at the gate", () => {
  it("is one line a pair, marked like a diff, with what changed", () => {
    expect(comparisonText([...GOOD, { old: "9", new: null, change: "removed", what: "消えた\n条" }], olds, news)).toBe(
      ["= 第1条 → 第1条", "~ 第2条 → 第2条  200,000円が220,000円に", "+ → 第3条  報告の条", "= 第3条 → 第4条", "- 9 →  消えた 条", ""].join("\n"),
    );
  });
});

describe("an article named in the table", () => {
  it("is found by its name, but not inside a longer number", () => {
    expect(mentions("| Article 1 | Article 1 | fee |", "Article 1")).toBe(true);
    expect(mentions("| Article 12 | Article 12 | fee |", "Article 1")).toBe(false);
    expect(mentions("Article 12 and Article 1.", "Article 1")).toBe(true);
    expect(mentions("第１２条", "第１")).toBe(false);
    expect(mentions("第18条", "第8条")).toBe(false);
    expect(mentions("", "第8条")).toBe(false);
  });
});

describe("a provision removed and added again", () => {
  it("is refused as a missed pair when the two read the same", () => {
    const rows = [GOOD[0], GOOD[1], GOOD[2], { old: "3", new: null, change: "removed" }, { old: null, new: "4", change: "added" }];
    expect(comparisonProblems(rows, olds, news)).toEqual(['第3条 (removed) and 第4条 (added) read the same: pair them as "same"']);
  });

  it("passes when the removed and the added provisions differ", () => {
    const rows = [GOOD[0], { old: "2", new: null, change: "removed" }, { old: null, new: "2", change: "added" }, GOOD[2], GOOD[3]];
    expect(comparisonProblems(rows, olds, news)).toEqual([]);
  });
});

describe("the table's section of a report", () => {
  const NAMES = ["新旧対照表", "Comparison table"];

  it("is found under a ## or a ### heading, up to the next heading at its depth or above", () => {
    expect(sectionText("## 新旧対照表\n| 第2条 |\n### 補足\n第3条\n## 確かめたこと\n第4条", NAMES)).toBe("| 第2条 |\n### 補足\n第3条");
    expect(sectionText("# 報告\n### 新旧対照表\n| 第2条 |\n### 確かめたこと\n第4条", NAMES)).toBe("| 第2条 |");
    expect(sectionText("### Comparison table\n| Article 2 |\n## What was checked\n", NAMES)).toBe("| Article 2 |");
  });

  it("is empty when the report has no such section, and a # title does not count", () => {
    expect(sectionText("# 新旧対照表\n| 第2条 |", NAMES)).toBe("");
    expect(sectionText("", NAMES)).toBe("");
  });
});
