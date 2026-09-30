// @vitest-environment node
// The polish pack's checks decide when a document was polished without changing what it says. They run here
// for real against a stand-in chaff (see docsPackHarness): the originals are kept, and the check compares
// headings, code blocks, link targets and chaff's tree addresses, and asks chaff for findings.
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("polish");
const { write, writeFake, node } = harness;

type Target = { file: string; before: number; status: string; note?: string };
const target = (file: string, status = "todo", before = 0): Target => ({ file, before, status });
const list = (targets: Target[]) => write(".blueprint/polish.json", { targets });

const ORIGINAL = [
  "# 手順",
  "",
  "設定を開くことによって、項目を選択することが可能となります。",
  "",
  "```sh",
  "npx mulmoterminal@latest",
  "```",
  "",
  "詳しくは [設定方法](config.html#per-dir) を見てください。https://example.com/help",
  "",
].join("\n");
const REWORDED = ORIGINAL.replace("設定を開くことによって、項目を選択することが可能となります。", "設定を開くと、項目を選べます。");

beforeEach(() => {
  harness.setUp();
  write(".blueprint/answers.json", { maxFiles: 3 });
  mkdirSync(join(harness.dir(), "docs"));
  write("docs/setup.md", ORIGINAL);
});
afterEach(() => harness.tearDown());

describeSh("polish: targets.mjs survey", () => {
  it("passes when the list matches chaff's count now", () => {
    writeFake("findings.json", { "docs/setup.md": [{ rule: "sentence-length", level: "warning", file: "docs/setup.md" }] });
    list([target("docs/setup.md", "todo", 1)]);
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    // The list as a person reads it at the gate before anything is changed.
    expect(readFileSync(join(harness.dir(), ".blueprint/polish.txt"), "utf8")).toBe("- docs/setup.md\n");
  });

  it("accepts names that only look like the parent or .blueprint", () => {
    write("..notes.md", "x");
    list([target("..notes.md")]);
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
  });

  it.each<[string, () => void, string]>([
    ["a count that does not match chaff", () => list([target("docs/setup.md", "todo", 5)]), "recorded 5, chaff says 0"],
    [
      "more files than agreed",
      () => {
        ["a.md", "b.md", "c.md", "d.md"].forEach((file) => write(file, "x"));
        list(["a.md", "b.md", "c.md", "d.md"].map((file) => target(file)));
      },
      "more than the agreed 3",
    ],
    ["a file that is not there", () => list([target("docs/missing.md")]), "not in this folder: docs/missing.md"],
    ["a file outside the folder", () => list([target("../outside.md")]), "inside this folder"],
    ["a file in .blueprint", () => list([target(".blueprint/x.md")]), "outside .blueprint"],
    ["a path that climbs out after a folder", () => list([target("docs/../../x.md")]), "inside this folder"],
    ["a file that is not text", () => list([target("docs/setup.pdf")]), ".md or .txt"],
    ["a file listed twice", () => list([target("docs/setup.md"), target("./docs/setup.md")]), "listed twice"],
    ["a file already marked", () => list([target("docs/setup.md", "done")]), "already marked"],
    ["a skip without a note", () => list([target("docs/setup.md", "skipped")]), "without a note"],
  ])("fails with %s", (_label, arrange, message) => {
    arrange();
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });
});

describeSh("polish: targets.mjs progress, verify and more", () => {
  const keepOriginal = (text = ORIGINAL) => {
    mkdirSync(join(harness.dir(), ".blueprint", "originals", "docs"), { recursive: true });
    write(".blueprint/originals/docs/setup.md", text);
  };
  const polished = (text: string, original = ORIGINAL) => {
    keepOriginal(original);
    write("docs/setup.md", text);
    list([target("docs/setup.md", "done", 1)]);
  };

  beforeEach(() => {
    list([target("docs/setup.md", "todo", 0)]);
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
  });

  it("passes for a reworded file whose skeleton is unchanged and that chaff finds clean, once", () => {
    polished(REWORDED);
    expect(node("targets.mjs", ["progress"]).code).toBe(0);
    expect(node("targets.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("no file finished") });
  });

  it.each<[string, string, string]>([
    ["a heading reworded", REWORDED.replace("# 手順", "# 手順書"), "headings changed"],
    ["a code block edited", REWORDED.replace("npx mulmoterminal@latest", "npx mulmoterminal"), "code blocks changed"],
    ["a link target changed", REWORDED.replace("config.html#per-dir", "config.html"), "link targets changed"],
    ["a bare URL dropped", REWORDED.replace("https://example.com/help", ""), "link targets changed"],
  ])("fails when %s", (_label, text, message) => {
    polished(text);
    expect(node("targets.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });

  it("does not read a line inside a code block as a heading", () => {
    const fenced = ORIGINAL.replace("npx mulmoterminal@latest", "# a shell comment");
    polished(fenced.replace("設定を開くことによって、項目を選択することが可能となります。", "設定を開くと、項目を選べます。"), fenced);
    expect(node("targets.mjs", ["progress"]).code).toBe(0);
  });

  it("fails when chaff's tree addresses changed", () => {
    polished(REWORDED);
    writeFake("tree.json", { "docs/setup.md": { address: "", children: [{ address: "3", children: [] }] } });
    expect(node("targets.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("addresses in chaff's tree changed") });
  });

  it("fails while chaff still finds something under the style, but not for a note", () => {
    polished(REWORDED);
    writeFake("findings.json", { "docs/setup.md": [{ rule: "ai-tell", level: "info", file: "docs/setup.md" }] });
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    writeFake("findings.json", { "docs/setup.md": [{ rule: "sentence-length", level: "warning", file: "docs/setup.md" }] });
    expect(node("targets.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("1 chaff finding(s) remain") });
  });

  it("fails when the original was not kept", () => {
    write("docs/setup.md", REWORDED);
    list([target("docs/setup.md", "done", 1)]);
    expect(node("targets.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("original is not saved") });
  });

  it("accepts a skip with a note, without comparing anything", () => {
    list([{ ...target("docs/setup.md", "skipped", 1), note: "直すと条の意味が変わる" }]);
    expect(node("targets.mjs", ["progress"]).code).toBe(0);
  });

  it("verify checks without counting, so the real progress check still passes after it", () => {
    polished(REWORDED);
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    expect(node("targets.mjs", ["progress"]).code).toBe(0);
  });

  it("more is yes while a file is to do", () => {
    expect(node("targets.mjs", ["more"]).code).toBe(0);
    polished(REWORDED);
    expect(node("targets.mjs", ["more"]).code).toBe(1);
  });
});

describeSh("polish: report.mjs", () => {
  const SECTIONS = ["整えたもの", "確かめたこと", "直さずに残したもの"];
  const report = (body: string) => write(".blueprint/polish-report.md", SECTIONS.map((section) => `## ${section}\n${body}`).join("\n"));

  it("passes when every file is finished and named", () => {
    list([target("docs/setup.md", "done", 1)]);
    report("docs/setup.md");
    expect(node("report.mjs").code).toBe(0);
  });

  it("names a file the report does not mention, and a file still to do", () => {
    list([target("docs/setup.md", "done", 1)]);
    report("なし");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("does not name: docs/setup.md") });
    list([target("docs/setup.md")]);
    report("docs/setup.md");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("still to do") });
  });
});

describeSh("polish: findings set aside, and the drafts for chaff", () => {
  const WITH_FEEDBACK = "chaff <file|dir|glob>...\n  chaff feedback <file> --rule <rule-id> [--line N]\n";
  const LONG = { rule: "sentence-length", level: "warning", file: "docs/setup.md", line: 3 };
  const JARGON = { rule: "internal-jargon", level: "warning", file: "docs/setup.md", line: 9 };
  const aside = (rule: string, line: number, because: string) => ({ rule, line, because, why: "条文の引用" });
  const polishedWith = (dismissed: unknown[]) => {
    mkdirSync(join(harness.dir(), ".blueprint", "originals", "docs"), { recursive: true });
    write(".blueprint/originals/docs/setup.md", ORIGINAL);
    write("docs/setup.md", REWORDED);
    write(".blueprint/polish.json", { targets: [{ ...target("docs/setup.md", "done", 2), dismissed }] });
  };
  const SECTIONS = ["整えたもの", "確かめたこと", "直さずに残したもの"];
  const report = (body: string, extra = "") => write(".blueprint/polish-report.md", SECTIONS.map((section) => `## ${section}\n${body}`).join("\n") + extra);

  beforeEach(() => writeFake("findings.json", { "docs/setup.md": [LONG, JARGON] }));

  it("passes when every remaining finding is set aside with a reason", () => {
    polishedWith([aside("sentence-length", 3, "meaning"), aside("internal-jargon", 9, "wrong")]);
    expect(node("targets.mjs", ["verify"])).toEqual({ code: 0, stderr: "" });
  });

  it("still counts a finding that was not set aside", () => {
    polishedWith([aside("sentence-length", 3, "meaning")]);
    expect(node("targets.mjs", ["verify"])).toMatchObject({ code: 1, stderr: expect.stringContaining("1 chaff finding(s) remain") });
  });

  it("refuses a dismissal chaff does not report, or one without a ground", () => {
    polishedWith([aside("sentence-length", 4, "meaning"), aside("internal-jargon", 9, "wrong")]);
    expect(node("targets.mjs", ["verify"]).stderr).toContain("chaff reports no sentence-length on line 4 now");
    polishedWith([aside("sentence-length", 3, "tired"), aside("internal-jargon", 9, "wrong")]);
    expect(node("targets.mjs", ["verify"]).stderr).toContain('"because" must be "wrong"');
  });

  it("drafts a report only for what chaff misread, and the report must name it and every rule set aside", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    polishedWith([aside("sentence-length", 3, "meaning"), aside("internal-jargon", 9, "wrong")]);
    expect(node("feedback.mjs").code).toBe(0);
    expect(readFileSync(join(harness.fake(), "feedback.log"), "utf8").trim()).toBe("docs/setup.md --rule internal-jargon --line 9 --experimental");
    report("docs/setup.md\n- 3 sentence-length 条文の引用\n- 9 internal-jargon 条文の引用");
    expect(node("report.mjs").stderr).toContain("lacks the section");
    report(
      "docs/setup.md\n- 3 sentence-length 条文の引用\n- 9 internal-jargon 条文の引用",
      "\n## chaff への報告の下書き\n.blueprint/chaff-feedback/wrong-1-1.md\n",
    );
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
    report("docs/setup.md internal-jargon 条文の引用", "\n## chaff への報告の下書き\n.blueprint/chaff-feedback/wrong-1-1.md\n");
    expect(node("report.mjs").stderr).toContain("of the findings set aside: docs/setup.md sentence-length (line 3)");
  });

  it("refuses findings set aside on a file that was not polished", () => {
    write(".blueprint/polish.json", {
      targets: [{ ...target("docs/setup.md", "skipped", 2), note: "対象外", dismissed: [aside("sentence-length", 3, "meaning")] }],
    });
    expect(node("targets.mjs", ["verify"]).stderr).toContain("only a file marked done can set findings aside");
  });
});

describeSh("polish: the kind of document decides chaff's genre", () => {
  const lintLog = () => readFileSync(join(harness.fake(), "lint.log"), "utf8").trim().split("\n");
  const answers = (extra: Record<string, unknown>) => write(".blueprint/answers.json", { maxFiles: 3, ...extra });

  it("measures a report as a report, in the survey and in every later check", () => {
    answers({ style: "chaff の既定のまま", kind: "報告書" });
    list([target("docs/setup.md", "todo", 0)]);
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    mkdirSync(join(harness.dir(), ".blueprint", "originals", "docs"), { recursive: true });
    write(".blueprint/originals/docs/setup.md", ORIGINAL);
    write("docs/setup.md", REWORDED);
    list([target("docs/setup.md", "done", 0)]);
    // A report is also read for its viewpoints; recorded here so the run gets as far as chaff.
    const read = ["conclusion-first", "actionable-ask", "unsourced-number", "stacked-hedging", "agentless-passive"];
    write(".blueprint/viewpoints.json", { "docs/setup.md": read.map((id) => ({ id, verdict: "ok" })) });
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    expect(lintLog()).toHaveLength(2);
    lintLog().forEach((line) => expect(line).toContain("--genre business/report"));
  });

  it.each<[string, Record<string, unknown>]>([
    ["the folder's own style, whose chaff.yaml names the genre", { style: "このフォルダの規約（STYLE.md と chaff.yaml）", kind: "報告書" }],
    ["a kind left to chaff", { style: "chaff の既定のまま", kind: "指定しない（chaff に任せる）" }],
    ["no kind at all (an interview from before it was asked)", { style: "chaff の既定のまま" }],
    ["a kind the pack does not know", { style: "chaff の既定のまま", kind: "詩" }],
  ])("passes no genre for %s", (_label, extra) => {
    answers(extra);
    list([target("docs/setup.md", "todo", 0)]);
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    expect(lintLog().some((line) => line.includes("--genre"))).toBe(false);
  });

  it("drafts a report to chaff under the same genre", () => {
    answers({ style: "chaff の既定のまま", kind: "ブログ（技術記事）" });
    writeFake("help.txt", "chaff <file|dir|glob>...\n  chaff feedback <file> --rule <rule-id> [--line N]\n");
    write(".blueprint/polish.json", {
      targets: [{ ...target("docs/setup.md", "done", 1), dismissed: [{ rule: "internal-jargon", line: 9, because: "wrong", why: "製品名" }] }],
    });
    expect(node("feedback.mjs").code).toBe(0);
    expect(readFileSync(join(harness.fake(), "feedback.log"), "utf8").trim()).toBe(
      "docs/setup.md --rule internal-jargon --line 9 --experimental --genre blog/tech",
    );
  });
});

describeSh("polish: nothing to polish", () => {
  const polishTxt = () => readFileSync(join(harness.dir(), ".blueprint/polish.txt"), "utf8");
  const nothing = (avoided?: string[]) => write(".blueprint/polish.json", { targets: [], ...(avoided ? { avoided } : {}) });

  beforeEach(() => {
    write(".blueprint/answers.json", { maxFiles: 3, targets: "docs" });
    write("docs/other.md", "# 別の文書\n\n本文。\n");
  });

  it("is an answer when every named document is clean, and the rounds after it pass with nothing to do", () => {
    nothing();
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    expect(polishTxt()).toContain("整える文書はありません");
    expect(node("targets.mjs", ["progress"])).toEqual({ code: 0, stderr: "" });
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    expect(node("targets.mjs", ["more"]).code).toBe(1);
  });

  it("is refused while a named document has a finding, naming it", () => {
    writeFake("findings.json", { "docs/other.md": [{ rule: "sentence-length", level: "warning", file: "docs/other.md" }] });
    nothing();
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("these have chaff findings: docs/other.md") });
  });

  it("does not count a finding that is only a note", () => {
    writeFake("findings.json", { "docs/other.md": [{ rule: "sentence-length", level: "note", file: "docs/other.md" }] });
    nothing();
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
  });

  it("leaves out a document the person asked to leave alone, and only one they named", () => {
    writeFake("findings.json", { "docs/other.md": [{ rule: "sentence-length", level: "warning", file: "docs/other.md" }] });
    nothing(["docs/other.md"]);
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("the answer avoid does not: docs/other.md") });
    write(".blueprint/answers.json", { maxFiles: 3, targets: "docs", avoid: "docs/other.md" });
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    nothing(["docs/other.md", "elsewhere.md"]);
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("not among the named documents: elsewhere.md") });
  });

  it("is refused when the answer names no document here", () => {
    write(".blueprint/answers.json", { maxFiles: 3, targets: "missing" });
    nothing();
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("names no Markdown or text file") });
  });

  it("refuses an empty list when a named place is a symbolic link, rather than following it", () => {
    symlinkSync(join(harness.dir(), "docs", "other.md"), join(harness.dir(), "docs", "linked.md"));
    nothing();
    expect(node("targets.mjs", ["survey"])).toMatchObject({
      code: 1,
      stderr: expect.stringContaining("could not be read as this folder's own documents: docs/linked.md"),
    });
  });

  it("refuses an empty list when the answer names a place outside this folder", () => {
    write(".blueprint/answers.json", { maxFiles: 3, targets: "docs\n../elsewhere" });
    nothing();
    expect(node("targets.mjs", ["survey"])).toMatchObject({
      code: 1,
      stderr: expect.stringContaining("could not be read as this folder's own documents: ../elsewhere"),
    });
  });

  it('checks "avoided" on a list with files in it too: named, asked for, and not also chosen', () => {
    write(".blueprint/answers.json", { maxFiles: 3, targets: "docs", avoid: "docs/" });
    write(".blueprint/polish.json", { targets: [target("docs/setup.md")], avoided: ["elsewhere.md"] });
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("not among the named documents: elsewhere.md") });
    write(".blueprint/polish.json", { targets: [target("docs/setup.md")], avoided: ["docs/setup.md"] });
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("both chosen and left alone: docs/setup.md") });
    write(".blueprint/polish.json", { targets: [target("docs/setup.md")], avoided: ["docs/other.md"] });
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    write(".blueprint/answers.json", { maxFiles: 3, targets: "docs", avoid: "docs/setup.md\n下書きは触らないで" });
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("the answer avoid does not: docs/other.md") });
  });

  it('refuses an "avoided" that is not a list of files', () => {
    write(".blueprint/polish.json", { targets: [], avoided: "docs/other.md" });
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining('"avoided" must be a list') });
  });
});

describeSh("polish: a report is read for what a report needs", () => {
  const REPORT_KIND = { maxFiles: 3, style: "chaff の既定のまま", kind: "報告書", targets: "docs" };
  const viewpoints = (entries: unknown[]) => write(".blueprint/viewpoints.json", { "docs/setup.md": entries });
  const everyOk = ["conclusion-first", "actionable-ask", "unsourced-number", "stacked-hedging", "agentless-passive"].map((id) => ({ id, verdict: "ok" }));
  const polishedReport = () => {
    mkdirSync(join(harness.dir(), ".blueprint", "originals", "docs"), { recursive: true });
    write(".blueprint/originals/docs/setup.md", ORIGINAL);
    write("docs/setup.md", REWORDED);
    list([target("docs/setup.md", "done", 0)]);
  };
  const SECTIONS = ["整えたもの", "確かめたこと", "直さずに残したもの"];
  const report = (extra: string) => write(".blueprint/polish-report.md", SECTIONS.map((section) => `## ${section}\ndocs/setup.md\n`).join("\n") + extra);

  beforeEach(() => {
    write(".blueprint/answers.json", REPORT_KIND);
    polishedReport();
  });

  it("is not done until every viewpoint of the kind is recorded", () => {
    expect(node("targets.mjs", ["verify"])).toMatchObject({ code: 1, stderr: expect.stringContaining("docs/setup.md: no viewpoints recorded") });
    viewpoints(everyOk);
    expect(node("targets.mjs", ["verify"])).toEqual({ code: 0, stderr: "" });
  });

  it("chooses every report, up to the agreed number, even when chaff finds nothing, since each is read for its viewpoints", () => {
    write("docs/second.md", "# 二つめ\n\n本文。\n");
    write(".blueprint/polish.json", { targets: [] });
    expect(node("targets.mjs", ["survey"])).toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "a business/report is read for its viewpoints: choose 2 of the named documents; not chosen: docs/second.md, docs/setup.md",
      ),
    });
    write(".blueprint/polish.json", { targets: [target("docs/setup.md")] });
    expect(node("targets.mjs", ["survey"])).toMatchObject({ code: 1, stderr: expect.stringContaining("not chosen: docs/second.md") });
    write(".blueprint/answers.json", { ...REPORT_KIND, maxFiles: 1 });
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
    write(".blueprint/answers.json", { ...REPORT_KIND, avoid: "docs/second.md\ndocs/setup.md" });
    write(".blueprint/polish.json", { targets: [], avoided: ["docs/second.md", "docs/setup.md"] });
    expect(node("targets.mjs", ["survey"]).code).toBe(0);
  });

  it("asks nothing more of a kind that has no viewpoints, or of the folder's own style", () => {
    write(".blueprint/answers.json", { ...REPORT_KIND, kind: "手順書・README" });
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    write(".blueprint/answers.json", { ...REPORT_KIND, style: "このフォルダの規約（STYLE.md と chaff.yaml）" });
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
  });

  it("puts every question for the writer in the report, quoted", () => {
    const question = { id: "actionable-ask", verdict: "writer", quote: "項目を選べます", note: "誰がいつまでに選びますか" };
    viewpoints([...everyOk.filter((entry) => entry.id !== "actionable-ask"), question]);
    expect(node("targets.mjs", ["verify"]).code).toBe(0);
    report("");
    expect(node("report.mjs").stderr).toContain("lacks the section 書いた人に確かめてほしいこと / For the writer");
    report("\n## 書いた人に確かめてほしいこと\n- docs/setup.md: 頼みごと\n");
    expect(node("report.mjs").stderr).toContain(
      "its part for the writer does not name the file and quote, word for word, the place of: docs/setup.md actionable-ask",
    );
    // The quotation elsewhere in the report does not count: the question belongs in the writer's part.
    report("\n項目を選べます\n\n## 書いた人に確かめてほしいこと\n- docs/setup.md 頼みごと\n");
    expect(node("report.mjs").stderr).toContain("the place of: docs/setup.md actionable-ask");
    report("\n## 書いた人に確かめてほしいこと\n- docs/setup.md 「項目を選べます」 誰がいつまでに選びますか\n");
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("asks nothing of a file that was skipped, even with a record left from an earlier try", () => {
    write(".blueprint/polish.json", { targets: [{ ...target("docs/setup.md", "skipped", 0), note: "原文の引用だけの文書" }] });
    write(".blueprint/viewpoints.json", { "docs/setup.md": [{ id: "actionable-ask", verdict: "writer", quote: "項目を選べます", note: "誰が？" }] });
    report("");
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });
});
