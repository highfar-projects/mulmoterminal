// @vitest-environment node
// The review pack's checks decide when a close reading is complete and honest: every structure problem chaff
// reports is addressed or dismissed with a reason, no finding claims a chaff result that does not exist,
// every quotation is found in its document (chaff cite), and the originals are never changed. They run here
// for real against a stand-in chaff (see docsPackHarness).
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("review");
const { write, writeFake, node } = harness;

const WITH_PROPOSALS = "直し方の案まで作る（原本は変えずに別のファイルに）";
const FINDINGS_ONLY = "指摘だけ";
const CONTRACT = ["第1条（目的）", "甲は、第12条に定める業務を委託する。", "", "第2条（委託料）", "委託料は50万円とする。", ""].join("\n");
const DANGLING = { rule: "dangling-reference", level: "error", file: "contract.txt", line: 2 };

type Finding = Record<string, unknown>;
const finding = (overrides: Finding = {}): Finding => ({
  id: "missing-article",
  kind: "dangling-reference",
  severity: "high",
  summary: "参照先の条が無い",
  explanation: "第1条が第12条を参照しているが、第12条は無い。",
  citations: [{ source: "contract.txt", address: "第1条", quote: "第12条に定める業務" }],
  machine: { rule: "dangling-reference", file: "contract.txt", line: 2 },
  ...overrides,
});
const record = (findings: Finding[], dismissed: Finding[] = []) => write(".blueprint/findings.json", { findings, dismissed });
const answers = (proposals = WITH_PROPOSALS, documents = "contract.txt") => write(".blueprint/answers.json", { documents, kind: "契約書", proposals });

beforeEach(() => {
  harness.setUp();
  answers();
  write("contract.txt", CONTRACT);
  writeFake("findings.json", { "contract.txt": [DANGLING, { rule: "sentence-length", level: "warning", file: "contract.txt", line: 5 }] });
});
afterEach(() => harness.tearDown());

describeSh("review: findings.mjs read", () => {
  it("passes when every structure result is a finding, and records the documents' fingerprints", () => {
    record([finding()]);
    expect(node("findings.mjs", ["read"])).toEqual({ code: 0, stderr: "" });
    expect(Object.keys(JSON.parse(readFileSync(join(harness.dir(), ".blueprint/.documents.json"), "utf8")))).toEqual(["contract.txt"]);
    expect(readFileSync(join(harness.fake(), "cite.log"), "utf8")).toContain("第12条に定める業務");
  });

  it("passes when a structure result is dismissed with a reason instead", () => {
    record([], [{ rule: "dangling-reference", file: "contract.txt", line: 2, why: "別の契約の条を指している" }]);
    expect(node("findings.mjs", ["read"]).code).toBe(0);
  });

  it("passes with no findings when chaff reports no structure problem", () => {
    writeFake("findings.json", {});
    record([]);
    expect(node("findings.mjs", ["read"]).code).toBe(0);
  });

  it("counts a document listed twice once", () => {
    answers(WITH_PROPOSALS, "contract.txt\n./contract.txt");
    record([finding()]);
    expect(node("findings.mjs", ["read"]).code).toBe(0);
    expect(readFileSync(join(harness.fake(), "cite.log"), "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("accepts a document named with a leading ./ and a finding with no machine result", () => {
    answers(WITH_PROPOSALS, "./contract.txt\n\n");
    writeFake("findings.json", {});
    record([finding({ kind: "ambiguity", machine: undefined, citations: [{ source: "./contract.txt", address: "第2条", quote: "50万円" }] })]);
    expect(node("findings.mjs", ["read"]).code).toBe(0);
  });

  it.each<[string, () => void, string]>([
    ["a structure result nobody addressed", () => record([finding({ machine: undefined, kind: "other" })]), "contract.txt:2 dangling-reference"],
    [
      "a result matched on the wrong line",
      () => record([finding({ machine: { rule: "dangling-reference", file: "contract.txt", line: 3 } })]),
      "does not address",
    ],
    [
      "a result matched under the wrong rule",
      () => record([finding({ machine: { rule: "numbering-gap", file: "contract.txt", line: 2 } })]),
      "does not address",
    ],
    [
      "a result matched in the wrong file",
      () => record([finding({ machine: { rule: "dangling-reference", file: "other.txt", line: 2 } })]),
      "does not address",
    ],
    [
      "a dismissal whose line is not a number",
      () => record([], [{ rule: "dangling-reference", file: "contract.txt", line: "2", why: "x" }]),
      'is { "rule", "file", "line", "why" }',
    ],
    ["a dismissal whose reason is blank", () => record([], [{ rule: "dangling-reference", file: "contract.txt", line: 2, why: "  " }]), 'needs a "why"'],
    ["a dismissal without a reason", () => record([], [{ rule: "dangling-reference", file: "contract.txt", line: 2 }]), 'needs a "why"'],
    [
      "a claimed chaff result that chaff did not report",
      () => record([finding(), finding({ id: "made-up", machine: { rule: "numbering-gap", file: "contract.txt", line: 4 } })]),
      "chaff reports no such thing: contract.txt:4 numbering-gap",
    ],
    [
      "a dismissal of a result chaff did not report",
      () => record([finding()], [{ rule: "numbering-gap", file: "contract.txt", line: 1, why: "x" }]),
      "chaff reports no such thing",
    ],
    [
      "a quotation from a file that is not under review",
      () => record([finding({ citations: [{ source: "other.txt", address: "第1条", quote: "x" }] })]),
      "not a document under review",
    ],
    [
      "a quotation chaff cite does not find",
      () => {
        writeFake("cite.json", { "contract.txt": 1 });
        record([finding()]);
      },
      "missing-article: quotations from contract.txt are not in it",
    ],
    ["a finding with no quotation", () => record([finding({ citations: [] })]), "quotes the text it is about"],
    ["a machine result that is not one", () => record([finding({ machine: null })]), '"machine" must be'],
    ["a machine result without a line", () => record([finding({ machine: { rule: "dangling-reference", file: "contract.txt" } })]), '"machine" must be'],
    ["an unknown kind", () => record([finding({ kind: "typo" })]), "kind must be one of"],
    ["an unknown severity", () => record([finding({ severity: "urgent" })]), "severity must be one of"],
    ["an empty summary", () => record([finding({ summary: " " })]), "no summary"],
    ["no explanation", () => record([finding({ explanation: undefined })]), "no explanation"],
    ["an id that is not a slug", () => record([finding({ id: "Bad Id" })]), "bad id"],
    ["a repeated id", () => record([finding(), finding({ machine: undefined, kind: "other" })]), "ids repeat"],
    ["a finding that is not an object", () => write(".blueprint/findings.json", { findings: ["x"] }), "not an object"],
    ["no findings array", () => write(".blueprint/findings.json", { dismissed: [] }), 'needs a "findings" array'],
    ["a document that is not there", () => answers(WITH_PROPOSALS, "contract.txt\nmissing.txt"), "not a file in this folder: missing.txt"],
    [
      "a folder named as a document",
      () => {
        mkdirSync(join(harness.dir(), "docs"));
        answers(WITH_PROPOSALS, "docs");
      },
      "not a file in this folder: docs",
    ],
    ["a document outside the folder", () => answers(WITH_PROPOSALS, "../contract.txt"), "must be inside this folder"],
    ["no document at all", () => answers(WITH_PROPOSALS, " \n"), "names no document"],
    ["interview answers that are null", () => write(".blueprint/answers.json", "null"), "names no document"],
    [
      "a document whose proposed copy would be another document",
      () => {
        write("contract.proposed.txt", CONTRACT);
        answers(WITH_PROPOSALS, "contract.txt\ncontract.proposed.txt");
      },
      "the proposed copy of contract.txt would be another document",
    ],
  ])("fails on %s", (_label, arrange, message) => {
    record([finding()]);
    arrange();
    const result = node("findings.mjs", ["read"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describeSh("review: findings.mjs propose", () => {
  const proposed = finding({ proposal: "第12条を第2条に直す" });
  const read = (findings: Finding[] = [finding()]) => {
    record(findings);
    expect(node("findings.mjs", ["read"]).code).toBe(0);
  };

  it("passes with a proposal per finding and a corrected copy beside the original", () => {
    read();
    record([proposed]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    expect(node("findings.mjs", ["propose"])).toEqual({ code: 0, stderr: "" });
  });

  it("asks for no copy of a document no finding is about", () => {
    write("terms.txt", "x");
    answers(WITH_PROPOSALS, "contract.txt\nterms.txt");
    read();
    record([proposed]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    expect(node("findings.mjs", ["propose"]).code).toBe(0);
  });

  it("passes a clean review with nothing to propose", () => {
    writeFake("findings.json", {});
    read([]);
    expect(node("findings.mjs", ["propose"]).code).toBe(0);
  });

  it("asks for nothing more when the person wanted findings only", () => {
    answers(FINDINGS_ONLY);
    read();
    expect(node("findings.mjs", ["propose"]).code).toBe(0);
    expect(existsSync(join(harness.dir(), "contract.proposed.txt"))).toBe(false);
  });

  it.each<[string, () => void, string]>([
    ["an original that changed", () => write("contract.txt", CONTRACT.replace("第12条", "第2条")), "the originals must stay as they are: contract.txt"],
    ["a finding without a proposal", () => record([finding()]), "findings without a proposal: missing-article"],
    ["a copy identical to the original", () => write("contract.proposed.txt", CONTRACT), "identical to the original"],
    [
      "a copy with more structure problems than the original",
      () => writeFake("findings.json", { "contract.txt": [DANGLING], "contract.proposed.txt": [DANGLING, { ...DANGLING, rule: "numbering-gap", line: 4 }] }),
      "2 structure problem(s), more than the original's 1",
    ],
  ])("fails on %s", (_label, arrange, message) => {
    read();
    record([proposed]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    arrange();
    const result = node("findings.mjs", ["propose"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("re-checks the findings: a quotation broken after the read fails here too", () => {
    read();
    writeFake("cite.json", { "contract.txt": 1 });
    record([proposed]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    expect(node("findings.mjs", ["propose"]).stderr).toContain("quotations from contract.txt are not in it");
  });

  it("re-checks the findings: a structure result dropped after the read fails here too", () => {
    read();
    record([finding({ id: "other", kind: "other", machine: undefined, proposal: "x" })]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    expect(node("findings.mjs", ["propose"]).stderr).toContain("does not address");
  });

  it("fails when there is no corrected copy at all", () => {
    read();
    record([proposed]);
    const result = node("findings.mjs", ["propose"]);
    expect(result.stderr).toContain("no proposed copy at contract.proposed.txt");
  });

  it("fails clearly when the recorded fingerprints are not an object", () => {
    read();
    write(".blueprint/.documents.json", "null");
    expect(node("findings.mjs", ["propose"]).stderr).toContain("is not what the read step records");
    write(".blueprint/.documents.json", "[]");
    expect(node("findings.mjs", ["propose"]).stderr).toContain("is not what the read step records");
  });

  it("fails when the proposed copy is a folder", () => {
    read();
    record([proposed]);
    mkdirSync(join(harness.dir(), "contract.proposed.txt"));
    expect(node("findings.mjs", ["propose"]).stderr).toContain("no proposed copy at contract.proposed.txt");
  });

  it("fails when the documents named now are not the ones the review read", () => {
    write("terms.txt", "x");
    answers(WITH_PROPOSALS, "contract.txt\nterms.txt");
    writeFake("findings.json", {});
    read([finding({ machine: undefined, kind: "other" })]);
    answers(WITH_PROPOSALS, "contract.txt");
    write("terms.txt", "changed");
    record([finding({ machine: undefined, kind: "other", proposal: "x" })]);
    write("contract.proposed.txt", CONTRACT.replace("第12条", "第2条"));
    expect(node("findings.mjs", ["propose"]).stderr).toContain("not the ones the review read");
  });

  it("fails when the read step never recorded the documents", () => {
    record([proposed]);
    expect(node("findings.mjs", ["propose"]).stderr).toContain(".blueprint/.documents.json is missing");
  });

  it("refuses a changed original in findings-only mode too", () => {
    answers(FINDINGS_ONLY);
    read();
    write("contract.txt", `${CONTRACT}追記`);
    expect(node("findings.mjs", ["propose"]).code).toBe(1);
  });

  it("refuses an unknown mode", () => {
    expect(node("findings.mjs", ["check"]).stderr).toContain("usage: findings.mjs read | propose");
  });
});

describeSh("review: report.mjs", () => {
  const REPORT = [
    "# 報告",
    "",
    "## 見つけたこと",
    "missing-article: 第1条の参照先が無い",
    "",
    "## 確かめたこと",
    "引用はすべて原文にある",
    "",
    "## 確かめきれなかったこと",
    "法令との関係",
    "",
  ].join("\n");

  beforeEach(() => record([finding()]));

  it("passes when every section is written and every finding is named", () => {
    write(".blueprint/review-report.md", REPORT);
    expect(node("report.mjs").code).toBe(0);
  });

  it.each<[string, string, string]>([
    ["a missing section", REPORT.replace("## 確かめきれなかったこと", "## その他"), "確かめきれなかったこと / Not checked"],
    ["an empty section", REPORT.replace("引用はすべて原文にある", ""), "確かめたこと / What was checked (empty)"],
    ["a finding the report does not name", REPORT.replace("missing-article", "参照"), "does not name: missing-article"],
  ])("fails on %s", (_label, text, message) => {
    write(".blueprint/review-report.md", text);
    const result = node("report.mjs");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("fails clearly when the findings are not a list", () => {
    write(".blueprint/review-report.md", REPORT);
    write(".blueprint/findings.json", { findings: {} });
    expect(node("report.mjs").stderr).toContain('needs a "findings" array');
  });

  it("fails when there is no report", () => {
    expect(node("report.mjs").stderr).toContain("review-report.md is missing");
  });
});
