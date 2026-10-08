// @vitest-environment node
// The summarize pack's checks, run for real against a stand-in chaff (docsPackHarness) that reads the shipped example
// as a tree of sections. The summary is refused unless it quotes, covers and copies; the report unless it carries it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness, PACKS } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("summarize");
const { write, writeFake, node } = harness;
const KEIHI = readFileSync(join(PACKS, "summarize", "presets", "keihi", "keihi.md"), "utf8");
const section = (address: string, heading: string, children: unknown[] = []) => ({ kind: "section", address, attrs: { heading }, children });
const TREE = {
  kind: "doc",
  address: "",
  children: [
    section("h1", "経費精算の手引き", [
      section("h1.1", "対象になるもの"),
      section("h1.2", "申請のしかた"),
      section("h1.3", "支払い"),
      section("h1.4", "領収書が無いとき"),
    ]),
  ],
};
const cite = (address: string, quote: string) => ({ source: "keihi.md", address, quote });
const SENTENCES = [
  { text: "仕事で使った交通費・宿泊費・会議の飲食代が対象になる。", citations: [cite("h1.1", "仕事のために使った交通費、宿泊費、会議の飲食代が対象です")] },
  { text: "使った日から30日以内に申請する。", citations: [cite("h1.2", "使った日から30日以内に申請します")] },
  { text: "確認が済むと毎月25日に給与口座へ振り込まれる。", citations: [cite("h1.3", "毎月25日にまとめて給与口座へ振り込みます")] },
];
const OMITTED = [{ source: "keihi.md", address: "h1.4", why: "例外の手続きのため" }];
const summary = (value: unknown) => write(".blueprint/summary.json", value);
const report = (body: string) => write(".blueprint/summary-report.md", body);
const GOOD_REPORT = [
  "## 要約",
  "",
  ...SENTENCES.map((sentence) => sentence.text),
  "",
  "## 出どころ",
  "",
  "- 「対象になるもの」「申請のしかた」「支払い」",
  "",
  "## 省いた部分",
  "",
  "- 「領収書が無いとき」: 例外の手続きのため",
  "",
].join("\n");

beforeEach(() => {
  harness.setUp();
  write("keihi.md", KEIHI);
  write(".blueprint/answers.json", { documents: "keihi.md", length: "短く（5 文まで）", reader: "", focus: "" });
  writeFake("tree.json", { "keihi.md": TREE });
});
afterEach(() => harness.tearDown());

describeSh("summarize: the summary", () => {
  it("passes a quoted, covering summary, and shows it with where each sentence comes from", () => {
    summary({ sentences: SENTENCES, omitted: OMITTED });
    expect(node("summary.mjs")).toEqual({ code: 0, stderr: "" });
    const readable = readFileSync(join(harness.dir(), ".blueprint", "summary.txt"), "utf8");
    expect(readable).toContain("使った日から30日以内に申請する。\n  (keihi.md 「申請のしかた」)");
    expect(readable).toContain("[keihi.md 「領収書が無いとき」] 例外の手続きのため");
  });

  it("refuses a quotation chaff cannot find in the document", () => {
    writeFake("cite.json", { "keihi.md": 1 });
    summary({ sentences: SENTENCES, omitted: OMITTED });
    expect(node("summary.mjs").stderr).toContain("sentence 1: quotations from keihi.md are not in it");
  });

  it("refuses a dropped part, an invented number, and a summary over the agreed length", () => {
    summary({ sentences: SENTENCES });
    expect(node("summary.mjs").stderr).toContain('keihi.md 領収書が無いとき: no sentence cites it, and it is not in "omitted"');
    summary({ sentences: [SENTENCES[0], { ...SENTENCES[1], text: "使った日から60日以内に申請する。" }, SENTENCES[2]], omitted: OMITTED });
    expect(node("summary.mjs").stderr).toContain("sentence 2 states 60");
    summary({ sentences: [...SENTENCES, ...SENTENCES], omitted: OMITTED });
    expect(node("summary.mjs").stderr).toContain("6 sentences, more than the 5 agreed");
  });

  it("refuses a document with no headings or articles, since nothing could show it was covered", () => {
    writeFake("tree.json", { "keihi.md": { kind: "doc", address: "", children: [] } });
    summary({ sentences: SENTENCES, omitted: OMITTED });
    expect(node("summary.mjs").stderr).toContain("keihi.md has no headings or articles chaff reads");
  });

  it("refuses a quotation from a file that is not one of the documents", () => {
    summary({
      sentences: [...SENTENCES.slice(0, 2), { ...SENTENCES[2], citations: [...SENTENCES[2].citations, { ...cite("h1.3", "x"), source: "other.md" }] }],
      omitted: OMITTED,
    });
    expect(node("summary.mjs").stderr).toContain("cites other.md, which is not one of the documents");
  });
});

describeSh("summarize: the report", () => {
  beforeEach(() => {
    summary({ sentences: SENTENCES, omitted: OMITTED });
    expect(node("summary.mjs").code).toBe(0);
  });

  it("passes when it carries every sentence and names every part left out", () => {
    report(GOOD_REPORT);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("refuses a sentence reworded, and one found only outside the summary section", () => {
    report(GOOD_REPORT.replace("使った日から30日以内に申請する。", "30日以内に申請する。"));
    expect(node("report.mjs").stderr).toContain("does not carry, word for word, sentence 2");
    report(`${GOOD_REPORT.replace("使った日から30日以内に申請する。\n", "")}\n使った日から30日以内に申請する。\n`);
    expect(node("report.mjs").stderr).toContain("sentence 2");
  });

  it("refuses a part left out that the report does not name, and asks for the section only when something was left out", () => {
    report(GOOD_REPORT.replace("「領収書が無いとき」", "「領収書が無いときの例外」"));
    expect(node("report.mjs").stderr).toContain("not named under 省いた部分 / Left out: 領収書が無いとき");
    report(GOOD_REPORT.replace(/## 省いた部分[\s\S]*$/u, ""));
    expect(node("report.mjs").stderr).toContain("lacks sections: 省いた部分 / Left out");
  });

  it("refuses when the document or the summary changed after the summarize step checked it", () => {
    report(GOOD_REPORT);
    write("keihi.md", `${KEIHI}\n追記。\n`);
    expect(node("report.mjs").stderr).toContain("a document changed since the summarize step");
    write("keihi.md", KEIHI);
    summary({ sentences: SENTENCES, omitted: OMITTED, note: "edited" });
    expect(node("report.mjs").stderr).toContain("changed since the summarize step checked it");
    write(".blueprint/.summary-checked", "[");
    expect(node("report.mjs").stderr).toContain("the summarize step's record is missing");
  });
});
