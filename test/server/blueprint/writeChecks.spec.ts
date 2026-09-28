// @vitest-environment node
// The write pack's checks decide when a brief, an outline and each written part count as done. They run
// here for real against a stand-in chaff (see docsPackHarness): a part is judged on what chaff says about
// it, and on whether its quotations were sent to `chaff cite`.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("write");
const { write, writeFake, node } = harness;
const at = (...parts: string[]): string => join(harness.dir(), ...parts);

const FOLDER_STYLE = "このフォルダの規約（STYLE.md と chaff.yaml）";
const DEFAULT_STYLE = "chaff の既定のまま";
const BRIEF_SECTIONS = ["目的", "読者", "要点", "資料から取る事実", "決まっていないこと"];
const brief = (sections: readonly string[] = BRIEF_SECTIONS, empty?: string): string =>
  sections.map((section) => `## ${section}\n${section === empty ? "" : "中身。"}`).join("\n");

// Points are unknown here so a malformed outline can be written as the agent might.
type Part = { id: string; title: string; file: string; points: unknown[]; status: string };
const part = (id: string, status = "todo", file = `${id}.md`): Part => ({ id, title: id, file, points: ["要点"], status });

beforeEach(() => harness.setUp());
afterEach(() => harness.tearDown());

describeSh("write: brief.mjs", () => {
  beforeEach(() => {
    write(".blueprint/answers.json", { sources: "", style: DEFAULT_STYLE });
    write(".blueprint/brief.md", brief());
  });

  it("passes with the five sections written and no sources asked for", () => {
    expect(node("brief.mjs").code).toBe(0);
  });

  it("accepts the sections in English", () => {
    write(".blueprint/brief.md", brief(["Purpose", "Audience", "Key points", "Facts from sources", "Open questions"]));
    expect(node("brief.mjs").code).toBe(0);
  });

  it.each([
    ["no brief", () => write(".blueprint/brief.md", ""), "lacks sections"],
    ["a section that is only a heading", () => write(".blueprint/brief.md", brief(BRIEF_SECTIONS, "要点")), "要点 / Key points (empty)"],
    ["a missing section", () => write(".blueprint/brief.md", brief(BRIEF_SECTIONS.filter((section) => section !== "読者"))), "読者 / Audience"],
  ])("fails with %s", (_label, arrange, message) => {
    arrange();
    expect(node("brief.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });

  describe("when the person named sources", () => {
    beforeEach(() => {
      write(".blueprint/answers.json", { sources: "https://example.com/report", style: DEFAULT_STYLE });
      mkdirSync(at(".blueprint", "sources"));
      write(".blueprint/sources/report.md", "# 報告\n本文。");
      write(".blueprint/sources.json", [{ file: "report.md", origin: "https://example.com/report" }]);
    });

    it("passes when they are collected with their origin", () => {
      expect(node("brief.mjs").code).toBe(0);
    });

    it.each([
      ["no list", () => write(".blueprint/sources.json", "[]"), "lists no source"],
      ["a listed file that is not there", () => write(".blueprint/sources.json", [{ file: "missing.md", origin: "x" }]), "missing.md"],
      ["a source without its origin", () => write(".blueprint/sources.json", [{ file: "report.md", origin: " " }]), "without an origin"],
    ])("fails with %s", (_label, arrange, message) => {
      arrange();
      expect(node("brief.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
    });
  });

  it("with the folder's style chosen, fails until STYLE.md and chaff.yaml are here", () => {
    write(".blueprint/answers.json", { sources: "", style: FOLDER_STYLE });
    expect(node("brief.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("STYLE.md and chaff.yaml") });
    write("STYLE.md", "## x\ny");
    write("chaff.yaml", "language: ja\n");
    expect(node("brief.mjs").code).toBe(0);
  });
});

describeSh("write: parts.mjs outline", () => {
  const outline = (parts: Part[]) => write(".blueprint/outline.json", { parts });

  it("passes with new files, every part to do", () => {
    outline([part("intro"), part("setup", "todo", "chapters/02-setup.md")]);
    expect(node("parts.mjs", ["outline"]).code).toBe(0);
    // The outline as a person reads it at the gate before the drafts.
    expect(readFileSync(join(harness.dir(), ".blueprint/outline.txt"), "utf8")).toContain("→ chapters/02-setup.md");
  });

  it.each<[string, Part[], string]>([
    ["no parts", [], "non-empty"],
    ["a bad id", [{ ...part("intro"), id: "Intro Part" }], "bad id"],
    ["a file that is not Markdown", [part("intro", "todo", "intro.txt")], ".md"],
    ["a file outside the folder", [part("intro", "todo", "../intro.md")], "inside this folder"],
    ["a file inside .blueprint", [part("intro", "todo", ".blueprint/intro.md")], "outside .blueprint"],
    ["a path that climbs out after a folder", [part("intro", "todo", "docs/../../intro.md")], "inside this folder"],
    ["no points", [{ ...part("intro"), points: [] }], "no points"],
    ["a point that is not text", [{ ...part("intro"), points: [{ text: "要点" }] }], "every point is a line of text"],
    ["a blank point", [{ ...part("intro"), points: ["要点", "  "] }], "every point is a line of text"],
    ["repeated ids", [part("intro"), part("intro", "todo", "b.md")], "ids repeat"],
    ["two parts on one file", [part("a", "todo", "x.md"), part("b", "todo", "./x.md")], "same file"],
    ["a part already done", [part("intro", "done")], "already marked"],
  ])("fails with %s", (_label, parts, message) => {
    outline(parts);
    expect(node("parts.mjs", ["outline"])).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });

  it("starts the count afresh, so a new outline after an earlier run is not blocked by the old count", () => {
    write(".blueprint/.parts-done", "2");
    outline([part("intro")]);
    expect(node("parts.mjs", ["outline"]).code).toBe(0);
    write("intro.md", "# intro\n本文。");
    outline([part("intro", "done")]);
    expect(node("parts.mjs", ["progress"]).code).toBe(0);
  });

  it("accepts names that only look like the parent or .blueprint", () => {
    outline([part("notes", "todo", "..notes.md"), part("bp", "todo", ".blueprintish/x.md")]);
    expect(node("parts.mjs", ["outline"]).code).toBe(0);
  });

  it("refuses to overwrite a file the person already has", () => {
    write("intro.md", "the person's own text");
    outline([part("intro")]);
    expect(node("parts.mjs", ["outline"])).toMatchObject({ code: 1, stderr: expect.stringContaining("already exist") });
  });
});

describeSh("write: parts.mjs progress and more", () => {
  beforeEach(() => {
    write(".blueprint/outline.json", { parts: [part("intro"), part("usage")] });
    expect(node("parts.mjs", ["outline"]).code).toBe(0);
  });
  const finish = (...ids: string[]) =>
    write(".blueprint/outline.json", {
      parts: [part("intro", ids.includes("intro") ? "done" : "todo"), part("usage", ids.includes("usage") ? "done" : "todo")],
    });

  it("more is yes while a part is to do, and no when all are done", () => {
    expect(node("parts.mjs", ["more"]).code).toBe(0);
    finish("intro", "usage");
    expect(node("parts.mjs", ["more"]).code).toBe(1);
  });

  it("passes when one more part is written and clean, and then wants another", () => {
    write("intro.md", "# intro\n本文。");
    finish("intro");
    expect(node("parts.mjs", ["progress"]).code).toBe(0);
    expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("no new part") });
  });

  it("verify checks the done parts without counting, so the real progress check still passes after it", () => {
    write("intro.md", "# intro\n本文。");
    finish("intro");
    expect(node("parts.mjs", ["verify"]).code).toBe(0);
    expect(node("parts.mjs", ["verify"]).code).toBe(0);
    expect(node("parts.mjs", ["progress"]).code).toBe(0);
  });

  it("verify fails on the same problems as progress", () => {
    finish("intro");
    expect(node("parts.mjs", ["verify"])).toMatchObject({ code: 1, stderr: expect.stringContaining("intro.md is not written") });
  });

  it("fails when the part marked done is not written, or is empty", () => {
    finish("intro");
    expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("intro.md is not written") });
    write("intro.md", "  \n");
    expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("is empty") });
  });

  it("fails when chaff finds something in it under the style, but not for a note", () => {
    write("intro.md", "# intro\n本文。");
    finish("intro");
    writeFake("findings.json", { "intro.md": [{ rule: "ai-tell", level: "info", file: "intro.md" }] });
    expect(node("parts.mjs", ["progress"]).code).toBe(0);
    finish("intro", "usage");
    write("usage.md", "# usage\n本文。");
    writeFake("findings.json", { "usage.md": [{ rule: "sentence-length", level: "warning", file: "usage.md" }] });
    expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("usage: sentence-length (warning)") });
  });

  describe("quotations", () => {
    beforeEach(() => {
      mkdirSync(at(".blueprint", "sources"));
      mkdirSync(at(".blueprint", "citations"));
      write(".blueprint/sources/report.md", "# 報告\n売上は増えた。");
      write("intro.md", "# intro\n売上は増えた。");
      finish("intro");
    });

    it("sends each part's quotations to chaff cite, source by source, and passes when they hold", () => {
      write(".blueprint/citations/intro.json", [{ source: "report.md", address: "h1", quote: "売上は増えた" }]);
      expect(node("parts.mjs", ["progress"]).code).toBe(0);
      const log = readFileSync(join(harness.fake(), "cite.log"), "utf8");
      expect(log).toContain("report.md");
      expect(log).toContain('"quote":"売上は増えた"');
    });

    it("fails when chaff cite does not find a quotation", () => {
      write(".blueprint/citations/intro.json", [{ source: "report.md", address: "h1", quote: "売上は倍になった" }]);
      writeFake("cite.json", { "report.md": 1 });
      expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("quotations from report.md are not in it") });
    });

    it("fails when a quotation names a source that was not collected", () => {
      write(".blueprint/citations/intro.json", [{ source: "other.md", address: "h1", quote: "x" }]);
      expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("other.md, which is not in .blueprint/sources/") });
    });

    it.each(["../../intro.md", "../report.md", "sub/report.md", ".hidden.md"])("refuses a source that is not a plain file name: %s", (source) => {
      write(".blueprint/citations/intro.json", [{ source, address: "h1", quote: "売上は増えた" }]);
      expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining("must be a file name in .blueprint/sources/") });
    });

    it("fails on a malformed quotation", () => {
      write(".blueprint/citations/intro.json", [{ source: "report.md", quote: "x" }]);
      expect(node("parts.mjs", ["progress"])).toMatchObject({ code: 1, stderr: expect.stringContaining('needs "source", "address" and "quote"') });
    });

    it("does not call chaff cite for a part with no quotations", () => {
      expect(node("parts.mjs", ["progress"]).code).toBe(0);
      expect(existsSync(join(harness.fake(), "cite.log"))).toBe(false);
    });
  });
});

describeSh("write: report.mjs", () => {
  const REPORT_SECTIONS = ["書いたもの", "確かめたこと", "確かめきれなかったこと"];
  const report = (body: string) => write(".blueprint/write-report.md", REPORT_SECTIONS.map((section) => `## ${section}\n${body}`).join("\n"));

  beforeEach(() => write(".blueprint/outline.json", { parts: [part("intro", "done"), part("usage", "done", "guide/usage.md")] }));

  it("passes when every part is done and named", () => {
    report("intro.md と guide/usage.md。");
    expect(node("report.mjs").code).toBe(0);
  });

  it("names a part's file the report does not mention", () => {
    report("intro.md だけ。");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("does not name: guide/usage.md") });
  });

  it("fails while a part is still to do", () => {
    write(".blueprint/outline.json", { parts: [part("intro", "done"), part("usage")] });
    report("intro.md と usage.md。");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("parts not written: usage") });
  });

  it("fails without a section's content", () => {
    write(".blueprint/write-report.md", "## 書いたもの\nintro.md guide/usage.md\n## 確かめたこと\n\n## 確かめきれなかったこと\nなし");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("確かめたこと / What was checked (empty)") });
  });
});

describeSh("write: findings set aside, and the drafts for chaff", () => {
  const WITH_FEEDBACK = "chaff <file|dir|glob>...\n  chaff feedback <file> --rule <rule-id> [--line N]\n";
  const QUOTE = { rule: "sentence-length", level: "warning", file: "intro.md", line: 2 };
  const HEADING = { rule: "sentence-length", level: "warning", file: "intro.md", line: 1 };
  const aside = (line: number, because: string) => ({ rule: "sentence-length", line, because, why: "資料の一文をそのまま引用" });
  const written = (dismissed: unknown[]) => {
    write("intro.md", "# はじめに\n引用。\n");
    write(".blueprint/outline.json", { parts: [{ ...part("intro", "done"), dismissed }] });
  };
  const REPORT_SECTIONS = ["書いたもの", "確かめたこと", "確かめきれなかったこと"];
  const report = (body: string, extra = "") =>
    write(".blueprint/write-report.md", REPORT_SECTIONS.map((section) => `## ${section}\n${body}`).join("\n") + extra);

  beforeEach(() => writeFake("findings.json", { "intro.md": [HEADING, QUOTE] }));

  it("passes a part whose remaining findings are set aside, and still counts one that is not", () => {
    written([aside(1, "wrong"), aside(2, "meaning")]);
    expect(node("parts.mjs", ["verify"])).toEqual({ code: 0, stderr: "" });
    written([aside(2, "meaning")]);
    expect(node("parts.mjs", ["verify"]).stderr).toContain("intro: sentence-length (warning)");
  });

  it("refuses a dismissal chaff does not report", () => {
    written([aside(1, "wrong"), aside(5, "meaning")]);
    expect(node("parts.mjs", ["verify"]).stderr).toContain("intro: dismissed[1]: chaff reports no sentence-length on line 5 now");
  });

  it("drafts what chaff misread, and the report names the draft and the rule set aside", () => {
    writeFake("help.txt", WITH_FEEDBACK);
    written([aside(1, "wrong"), aside(2, "meaning")]);
    expect(node("feedback.mjs").code).toBe(0);
    expect(readFileSync(join(harness.fake(), "feedback.log"), "utf8").trim()).toBe("intro.md --rule sentence-length --line 1 --experimental");
    report("intro.md\n- 1 sentence-length 資料の一文をそのまま引用\n- 2 sentence-length 資料の一文をそのまま引用");
    expect(node("report.mjs").stderr).toContain("lacks the section");
    report(
      "intro.md\n- 1 sentence-length 資料の一文をそのまま引用\n- 2 sentence-length 資料の一文をそのまま引用",
      "\n## chaff への報告の下書き\n.blueprint/chaff-feedback/wrong-intro-1.md\n",
    );
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
    report("intro.md", "\n## chaff への報告の下書き\n.blueprint/chaff-feedback/wrong-intro-1.md\n");
    expect(node("report.mjs").stderr).toContain("of the findings set aside: intro sentence-length (line 1), intro sentence-length (line 2)");
  });
});
