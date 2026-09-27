// @vitest-environment node
// The polish pack's checks decide when a document was polished without changing what it says. They run here
// for real against a stand-in chaff (see docsPackHarness): the originals are kept, and the check compares
// headings, code blocks, link targets and chaff's tree addresses, and asks chaff for findings.
import { mkdirSync } from "node:fs";
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
