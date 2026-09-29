// @vitest-environment node
// The review pack's reports to chaff: which cases are worth one (a structure result the review dismissed, a
// structure finding chaff did not report), drafting each with `chaff feedback` — or recording that the chaff in
// use cannot — and a report that hands every draft to the person. Nothing is ever sent.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { feedbackCases, lineOfQuote } from "../../../blueprints/review/checks/candidates.mjs";
import { docsPackHarness } from "./docsPackHarness";

describe("lineOfQuote", () => {
  const text = ["第1条（目的）", "甲は、第12条に", "定める業務を委託する。", "😀 第2条", "委託料は 50 万円"].join("\n");
  const cases: readonly (readonly [string, number | undefined])[] = [
    ["第1条", 1],
    ["第12条に定める業務", 2],
    ["第12条に\n定める", 2],
    ["定める 業務", 3],
    ["第2条", 4],
    ["委託料は50万円", 5],
    ["無い文", undefined],
    ["  ", undefined],
  ];
  it.each(cases)("%j → %s", (quote, expected) => expect(lineOfQuote(text, quote)).toBe(expected));

  it("counts lines right after an emoji, where a quotation starts at the end of a line", () => {
    expect(lineOfQuote("😀\n第\n2条", "第2")).toBe(2);
  });
});

describe("feedbackCases", () => {
  const citation = { source: "./contract.txt", address: "第1条", quote: "第12条に定める業務" };
  const textOf = () => "第1条\n甲は、第12条に定める業務を委託する。\n";

  it("a dismissed structure result is a case chaff got wrong", () => {
    const cases = feedbackCases({ findings: [], dismissed: [{ rule: "dangling-reference", file: "./contract.txt", line: 2, why: "別の契約" }] }, textOf);
    expect(cases).toEqual([{ id: "wrong-1", kind: "wrong", file: "contract.txt", rule: "dangling-reference", line: 2 }]);
  });

  it("a structure finding with no machine result is a case chaff missed, on the line its quotation starts", () => {
    const cases = feedbackCases({ findings: [{ id: "gap", kind: "numbering-gap", citations: [citation] }], dismissed: [] }, textOf);
    expect(cases).toEqual([{ id: "missed-gap", kind: "missed", file: "contract.txt", rule: "numbering-gap", line: 2 }]);
  });

  it("leaves out findings chaff reported, findings that are not about structure, and quotations it cannot place", () => {
    const findings = [
      { id: "found", kind: "dangling-reference", citations: [citation], machine: { rule: "dangling-reference", file: "contract.txt", line: 2 } },
      { id: "meaning", kind: "contradiction", citations: [citation] },
      { id: "nowhere", kind: "duplicate-definition", citations: [{ ...citation, quote: "無い文" }] },
    ];
    expect(feedbackCases({ findings, dismissed: [] }, textOf)).toEqual([]);
  });

  it("lists the wrong cases before the missed ones", () => {
    const cases = feedbackCases(
      {
        findings: [{ id: "gap", kind: "numbering-gap", citations: [citation] }],
        dismissed: [{ rule: "numbering-gap", file: "contract.txt", line: 1 }],
      },
      textOf,
    );
    expect(cases.map((entry) => entry.id)).toEqual(["wrong-1", "missed-gap"]);
  });
});

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("review");
const { write, writeFake, node } = harness;

const CONTRACT = ["第1条（目的）", "甲は、第12条に定める業務を委託する。", "", "第3条（委託料）", "委託料は50万円とする。", ""].join("\n");
const WITH_FEEDBACK = "chaff <file|dir|glob>...\n  chaff feedback <file> --rule <rule-id> [--line N]\n";
const FINDINGS = {
  findings: [
    {
      id: "article-gap",
      kind: "numbering-gap",
      severity: "medium",
      summary: "第2条が無い",
      explanation: "第1条の次が第3条になっている。",
      citations: [{ source: "contract.txt", address: "第3条", quote: "第3条（委託料）" }],
    },
  ],
  dismissed: [{ rule: "dangling-reference", file: "contract.txt", line: 2, why: "別の契約の条を指している" }],
};
const REPORT = ["## 見つけたこと", "article-gap", "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"];
const report = (extra: string[] = []) => write(".blueprint/review-report.md", [...REPORT, ...extra].join("\n\n"));
const draftsSection = ["## chaff への報告の下書き", ".blueprint/chaff-feedback/wrong-1.md", ".blueprint/chaff-feedback/missed-article-gap.md"];

beforeEach(() => {
  harness.setUp();
  write(".blueprint/answers.json", { documents: "contract.txt", kind: "契約書", proposals: "指摘だけ" });
  write("contract.txt", CONTRACT);
  write(".blueprint/findings.json", FINDINGS);
});
afterEach(() => harness.tearDown());

describeSh("review: feedback.mjs", () => {
  it("drafts one report per case with chaff feedback, and keeps each under .blueprint", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    expect(readFileSync(join(harness.fake(), "feedback.log"), "utf8").trim().split("\n")).toEqual([
      "contract.txt --rule dangling-reference --line 2 --experimental",
      "contract.txt --missed --line 4 --experimental",
    ]);
    const index = JSON.parse(readFileSync(join(harness.dir(), ".blueprint/chaff-feedback/index.json"), "utf8"));
    expect(index.supported).toBe(true);
    expect(index.drafts.map((entry: { draft: string }) => entry.draft)).toEqual([
      ".blueprint/chaff-feedback/wrong-1.md",
      ".blueprint/chaff-feedback/missed-article-gap.md",
    ]);
    expect(existsSync(join(harness.dir(), ".chaff-feedback.md"))).toBe(false);
  });

  it("records that a chaff without feedback cannot draft, and drafts nothing", () => {
    expect(node("feedback.mjs").code).toBe(0);
    const index = JSON.parse(readFileSync(join(harness.dir(), ".blueprint/chaff-feedback/index.json"), "utf8"));
    expect(index).toMatchObject({ supported: false });
    expect(index.drafts).toHaveLength(2);
    expect(existsSync(join(harness.fake(), "feedback.log"))).toBe(false);
  });

  it("refuses to overwrite a draft already in the folder", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    write(".chaff-feedback.md", "the person's own draft");
    expect(node("feedback.mjs").stderr).toContain(".chaff-feedback.md already exists");
    expect(readFileSync(join(harness.dir(), ".chaff-feedback.md"), "utf8")).toBe("the person's own draft");
  });

  it("stops when chaff feedback fails", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    writeFake("feedback.code", "1");
    expect(node("feedback.mjs").stderr).toContain("chaff feedback did not draft wrong-1");
  });

  it("removes what it made when a later draft fails, so a rerun starts clean", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    writeFake("failline.txt", "4");
    expect(node("feedback.mjs").stderr).toContain("chaff feedback did not draft missed-article-gap");
    const dir = join(harness.dir(), ".blueprint/chaff-feedback");
    expect(["wrong-1.md", "index.json"].filter((file) => existsSync(join(dir, file)))).toEqual([]);
    expect(existsSync(join(harness.dir(), ".chaff-feedback.md"))).toBe(false);
    rmSync(join(harness.fake(), "failline.txt"));
    expect(node("feedback.mjs").code).toBe(0);
  });
});

describeSh("review: report.mjs and the drafts", () => {
  it("fails when there are cases and feedback.mjs has not run", () => {
    report();
    expect(node("report.mjs").stderr).toContain("2 case(s) to report to chaff");
  });

  it("passes when the report names every draft", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    report(draftsSection);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("fails when the report leaves out a draft or the section", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    report(draftsSection.slice(0, 2));
    expect(node("report.mjs").stderr).toContain("does not name the drafts: .blueprint/chaff-feedback/missed-article-gap.md");
    report();
    expect(node("report.mjs").stderr).toContain("lacks the section");
  });

  it("fails when a draft is gone", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    rmSync(join(harness.dir(), ".blueprint/chaff-feedback/wrong-1.md"));
    report(draftsSection);
    expect(node("report.mjs").stderr).toContain("drafts missing for: wrong-1");
  });

  it("fails when a case moved to another line but kept its id", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    write(".blueprint/findings.json", { ...FINDINGS, dismissed: [{ ...FINDINGS.dismissed[0], line: 5 }] });
    report(draftsSection);
    expect(node("report.mjs").stderr).toContain("out of date");
  });

  it("fails when the cases changed since feedback.mjs ran", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    expect(node("feedback.mjs").code).toBe(0);
    write(".blueprint/findings.json", { ...FINDINGS, dismissed: [] });
    report(draftsSection);
    expect(node("report.mjs").stderr).toContain("out of date");
  });

  it("asks for no drafts section when the chaff in use cannot draft", () => {
    expect(node("feedback.mjs").code).toBe(0);
    report();
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("asks for nothing when there are no cases", () => {
    write(".blueprint/findings.json", { findings: [], dismissed: [] });
    report();
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });
});
