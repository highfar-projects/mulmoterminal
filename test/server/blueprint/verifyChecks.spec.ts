// @vitest-environment node
// The verify pack's checks: extract passes only when every extracted value is written in its own quotation
// and every quotation is in the document (chaff cite); report decides the problems by machine, and passes
// only when the report names each of them, on facts unchanged since extract checked them. They run here for
// real against a stand-in chaff (see docsPackHarness).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("verify");
const { write, writeFake, node } = harness;

const TRIP = ["# 旅程", "", "10月1日（金）9:00 東京駅発 → 11:30 新大阪駅着", "", "宿泊費 24,000円 / 交通費 12,000円 / 合計 35,000円", ""].join("\n");
const depart = {
  id: "depart",
  date: "2026-10-01",
  weekday: "金",
  start: "09:00",
  end: "11:30",
  title: "東京駅から新大阪駅",
  citation: { source: "trip.md", address: "h1", quote: "10月1日（金）9:00 東京駅発 → 11:30 新大阪駅着" },
};
const priced = (id: string, value: number, quote: string) => ({ id, label: id, value, unit: "円", citation: { source: "trip.md", address: "h1", quote } });
const facts = (overrides: Record<string, unknown> = {}) =>
  write(".blueprint/facts.json", {
    events: [depart],
    amounts: [priced("hotel", 24000, "宿泊費 24,000円"), priced("train", 12000, "交通費 12,000円")],
    totals: [{ ...priced("total", 35000, "合計 35,000円"), parts: ["hotel", "train"] }],
    ...overrides,
  });
const PROBLEMS = ["weekday-mismatch-depart", "total-mismatch-total"];
const report = (named = PROBLEMS) =>
  write(".blueprint/verify-report.md", ["## 見つけたこと", ...named, "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"].join("\n\n"));

beforeEach(() => {
  harness.setUp();
  write(".blueprint/answers.json", { documents: "trip.md", kind: "旅程表・行程表", year: "2026" });
  write("trip.md", TRIP);
  facts();
});
afterEach(() => harness.tearDown());

describeSh("verify: extract.mjs", () => {
  it("passes when every value is in its quotation, and checks every quotation with chaff cite", () => {
    expect(node("extract.mjs")).toEqual({ code: 0, stderr: "" });
    const cited = readFileSync(join(harness.fake(), "cite.log"), "utf8");
    expect(cited).toContain("東京駅発");
    expect(cited).toContain("合計 35,000円");
  });

  it("fails on a value the AI did not read from the quoted text", () => {
    facts({ events: [{ ...depart, start: "08:00" }] });
    const result = node("extract.mjs");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("depart: start 08:00 is not in its quotation");
  });

  it("fails when a quotation is not in the document", () => {
    writeFake("cite.json", { "trip.md": 1 });
    const result = node("extract.mjs");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("quotations from trip.md are not in it");
  });

  it("fails on a malformed entry, naming it", () => {
    facts({ events: [{ ...depart, date: "10/1" }] });
    expect(node("extract.mjs").stderr).toContain("events[0] (depart)");
  });

  it("passes with dates written MM-DD when the year was left blank", () => {
    write(".blueprint/answers.json", { documents: "trip.md", kind: "旅程表・行程表", year: "" });
    facts({ events: [{ id: depart.id, date: "10-01", start: depart.start, end: depart.end, title: depart.title, citation: depart.citation }] });
    expect(node("extract.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("fails when nothing was extracted", () => {
    write(".blueprint/facts.json", {});
    expect(node("extract.mjs").stderr).toContain("holds no events, amounts or totals");
  });

  it("refuses a quotation from a file that is not one of the documents", () => {
    facts({ events: [{ ...depart, citation: { ...depart.citation, source: "other.md" } }] });
    expect(node("extract.mjs").stderr).toContain("cites other.md, which is not one of the documents");
  });
});

describeSh("verify: report.mjs", () => {
  beforeEach(() => expect(node("extract.mjs").code).toBe(0));

  it("writes the problems the machine found, and fails until the report exists", () => {
    const result = node("report.mjs");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("found 2 problem(s)");
    const written = JSON.parse(readFileSync(join(harness.dir(), ".blueprint/verification.json"), "utf8"));
    expect(written.problems.map((problem: { id: string }) => problem.id)).toEqual(PROBLEMS);
  });

  it("passes when the report names every problem", () => {
    report();
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("fails when the report drops a problem", () => {
    report([PROBLEMS[0] ?? ""]);
    expect(node("report.mjs").stderr).toContain("does not name: total-mismatch-total");
  });

  it("does not count ids pasted into a code block", () => {
    write(".blueprint/verify-report.md", ["## 見つけたこと", "```", ...PROBLEMS, "```", "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"].join("\n\n"));
    expect(node("report.mjs").stderr).toContain("does not name: weekday-mismatch-depart, total-mismatch-total");
  });

  it("keeps a backtick block open across a ~~~ line inside it", () => {
    const body = ["## 見つけたこと", "```", "~~~", ...PROBLEMS, "```", "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"];
    write(".blueprint/verify-report.md", body.join("\n\n"));
    expect(node("report.mjs").stderr).toContain("does not name: weekday-mismatch-depart, total-mismatch-total");
  });

  it("keeps a four-backtick block open across a shorter fence inside it", () => {
    const body = ["## 見つけたこと", "````", "```", ...PROBLEMS, "````", "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"];
    write(".blueprint/verify-report.md", body.join("\n\n"));
    expect(node("report.mjs").stderr).toContain("does not name: weekday-mismatch-depart, total-mismatch-total");
  });

  it("does not count ids hidden in an HTML comment", () => {
    const body = ["## 見つけたこと", `<!-- ${PROBLEMS.join(" ")} -->`, "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"];
    write(".blueprint/verify-report.md", body.join("\n\n"));
    expect(node("report.mjs").stderr).toContain("does not name: weekday-mismatch-depart, total-mismatch-total");
  });

  it("does not count ids pasted into a tilde code block", () => {
    write(".blueprint/verify-report.md", ["## 見つけたこと", "~~~", ...PROBLEMS, "~~~", "## 確かめたこと", "x", "## 確かめきれなかったこと", "y"].join("\n\n"));
    expect(node("report.mjs").stderr).toContain("does not name: weekday-mismatch-depart, total-mismatch-total");
  });

  it("fails when the report lacks a section", () => {
    write(".blueprint/verify-report.md", ["## 見つけたこと", ...PROBLEMS].join("\n\n"));
    expect(node("report.mjs").stderr).toContain("lacks sections");
  });

  it("refuses facts changed after extract checked them", () => {
    report();
    facts({ totals: [] });
    expect(node("report.mjs").stderr).toContain("changed since the extract step checked it");
  });
});
