// @vitest-environment node
// The compare pack's checks, run for real against a stand-in chaff (docsPackHarness) that reads the shipped example's
// two versions as article trees. The pairing is refused unless it covers every article and says truly what changed,
// and the table is refused unless it shows every article that did.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness, PACKS } from "./docsPackHarness";
import { articleTree } from "./articleTree";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("compare");
const { write, writeFake, node } = harness;
const EXAMPLE = join(PACKS, "compare", "presets", "itaku-kaitei");
const KYU = readFileSync(join(EXAMPLE, "kyu.txt"), "utf8");
const SHIN = readFileSync(join(EXAMPLE, "shin.txt"), "utf8");

// The example's true pairing: two articles changed, one added, one removed, and the last renumbered unchanged.
const TRUE_ROWS = [
  { old: "1", new: "1", change: "same" },
  { old: "2", new: "2", change: "changed", what: "報告が月に一度から二度に" },
  { old: "3", new: "3", change: "same" },
  { old: "4", new: "4", change: "changed", what: "月額200,000円が220,000円に" },
  { old: null, new: "5", change: "added", what: "報告の条" },
  { old: "6", new: "6", change: "same" },
  { old: "7", new: "7", change: "same" },
  { old: "8", new: null, change: "removed", what: "成果物の扱いの条" },
  { old: "9", new: "8", change: "same" },
];
const pairing = (rows: unknown[]) => write(".blueprint/comparison.json", { rows });
const TABLE =
  "| 旧 | 新 | 変わったこと |\n|---|---|---|\n| 第2条 | 第2条 | 報告の回数 |\n| 第4条 | 第4条 | 委託料 |\n| （なし） | 第5条 | 足された |\n| 第8条 | （なし） | 消えた |\n";
const report = (table: string) => write(".blueprint/compare-report.md", `# 新旧対照\n\n## 新旧対照表\n\n${table}\n## 確かめたこと\n\n機械で比べた。\n`);

beforeEach(() => {
  harness.setUp();
  write("kyu.txt", KYU);
  write("shin.txt", SHIN);
  write(".blueprint/answers.json", { old: "kyu.txt", new: "shin.txt", focus: "" });
  writeFake("tree.json", { "kyu.txt": articleTree(KYU), "shin.txt": articleTree(SHIN) });
});
afterEach(() => harness.tearDown());

describeSh("compare: the pairing", () => {
  it("passes the example's true pairing, and writes it as a person reads it", () => {
    pairing(TRUE_ROWS);
    expect(node("comparison.mjs")).toEqual({ code: 0, stderr: "" });
    const readable = readFileSync(join(harness.dir(), ".blueprint", "comparison.txt"), "utf8");
    expect(readable).toContain("~ 第4条 → 第4条  月額200,000円が220,000円に");
    expect(readable).toContain("= 第9条 → 第8条");
  });

  it("refuses 'same' over the changed fee, and a renumbered article paired by number instead of by content", () => {
    pairing(TRUE_ROWS.map((row) => (row.old === "4" ? { old: "4", new: "4", change: "same" } : row)));
    expect(node("comparison.mjs").stderr).toContain('第4条 → 第4条: written "same", but the text differs');
    pairing([...TRUE_ROWS.slice(0, 7), { old: "8", new: "8", change: "same" }, { old: "9", new: null, change: "removed" }]);
    expect(node("comparison.mjs").stderr).toContain('第8条 → 第8条: written "same", but the text differs');
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["two old versions named", { old: "kyu.txt\nshin.txt", new: "shin.txt" }, "the old version must be one file"],
    ["the same file twice", { old: "kyu.txt", new: "kyu.txt" }, "the same file"],
    ["a version outside the folder", { old: "../kyu.txt", new: "shin.txt" }, "must be inside this folder"],
  ])("refuses %s", (_label, answers, message) => {
    write(".blueprint/answers.json", answers);
    pairing(TRUE_ROWS);
    expect(node("comparison.mjs").stderr).toContain(message);
  });

  it("refuses a version with no articles, saying what it compares", () => {
    writeFake("tree.json", { "kyu.txt": { kind: "doc", address: "", children: [] }, "shin.txt": articleTree(SHIN) });
    pairing(TRUE_ROWS);
    expect(node("comparison.mjs").stderr).toContain("has no article chaff reads");
  });
});

describeSh("compare: the table", () => {
  beforeEach(() => {
    pairing(TRUE_ROWS);
    expect(node("comparison.mjs").code).toBe(0);
  });

  it("passes when the table shows every article that changed, was added or was removed", () => {
    report(TABLE);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("names what the table leaves out, and does not count a name that is part of a longer one", () => {
    report(TABLE.replace("| 第8条 | （なし） | 消えた |\n", ""));
    expect(node("report.mjs").stderr).toContain("the table does not show: removed 第8条");
    report(TABLE.replace("| 第8条 | （なし） | 消えた |\n", "| Article 18 | | |\n"));
    expect(node("report.mjs").stderr).toContain("removed 第8条");
  });

  it("does not count an article named only outside the table", () => {
    write(".blueprint/compare-report.md", `## 新旧対照表\n\n${TABLE.replace("| 第8条 | （なし） | 消えた |\n", "")}\n## 確かめたこと\n\n第8条は消えた。\n`);
    expect(node("report.mjs").stderr).toContain("removed 第8条");
  });

  it("refuses when a version or the pairing changed after the pair step checked it", () => {
    report(TABLE);
    write("shin.txt", `${SHIN}\n`);
    expect(node("report.mjs").stderr).toContain("a version changed since the pair step");
    write("shin.txt", SHIN);
    pairing([...TRUE_ROWS]);
    write(".blueprint/comparison.json", { rows: TRUE_ROWS, note: "edited" });
    expect(node("report.mjs").stderr).toContain("changed since the pair step checked it");
  });

  it("reads the table under a ### heading, and still not an article named only outside it", () => {
    write(".blueprint/compare-report.md", `# 新旧対照\n\n### 新旧対照表\n\n${TABLE}\n### 確かめたこと\n\n機械で比べた。\n`);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
    write(".blueprint/compare-report.md", `### 新旧対照表\n\n${TABLE.replace("| 第8条 | （なし） | 消えた |\n", "")}\n### 確かめたこと\n\n第8条は消えた。\n`);
    expect(node("report.mjs").stderr).toContain("removed 第8条");
  });

  it("stops with a plain word when the pair step's record is missing or broken", () => {
    report(TABLE);
    write(".blueprint/.comparison-checked", "{ not json");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("the pair step's record is missing: run that step again") });
  });

  it("refuses a report without its sections", () => {
    write(".blueprint/compare-report.md", "## 新旧対照表\n\n" + TABLE);
    expect(node("report.mjs").stderr).toContain("lacks sections: 確かめたこと / What was checked");
  });
});
