// @vitest-environment node
// The glossary pack's checks, run for real against a stand-in chaff (docsPackHarness) over the shipped example. The
// glossary is refused unless it gives every defined term; chaff.yaml is refused unless it keeps what it had, turns
// preferred-term on and makes chaff report the spellings still in the documents — or is untouched when not asked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness, PACKS } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("glossary");
const { write, writeFake, node } = harness;
const EXAMPLE = join(PACKS, "glossary", "presets", "shanai-yogo");
const KITEI = readFileSync(join(EXAMPLE, "kitei.txt"), "utf8");
const TEBIKI = readFileSync(join(EXAMPLE, "tebiki.md"), "utf8");
const definition = (term: string) => ({ kind: "definition", address: "", attrs: { term }, children: [] });
const cite = (source: string, address: string, quote: string) => ({ source, address, quote });
const GLOSSARY = {
  terms: [
    {
      term: "社員",
      definitions: [
        cite("kitei.txt", "2", "「社員」とは、会社と雇用契約を結んでいる者をいう"),
        cite("tebiki.md", "h1.1", "「社員」とは、正社員と契約社員をいいます"),
      ],
      spellings: [{ spelling: "社員", citations: [cite("kitei.txt", "3", "社員は、テレワークをする日")] }],
    },
    {
      term: "テレワーク",
      definitions: [cite("kitei.txt", "2.2", "「テレワーク」とは")],
      spellings: [{ spelling: "テレワーク", citations: [cite("kitei.txt", "1", "テレワークで働く")] }],
    },
    {
      term: "サーバー",
      spellings: [
        { spelling: "サーバー", citations: [cite("tebiki.md", "h1.2", "会社のサーバーに接続")] },
        { spelling: "サーバ", citations: [cite("kitei.txt", "4", "VPN を通してサーバに接続")] },
      ],
      preferred: "サーバー",
    },
  ],
};
const RULES = (level: string) => ({
  schema_version: 1,
  detected: { genre: "technical/readme", language: "ja" },
  rules: [{ id: "preferred-term", now: { level } }],
});
const found = (file: string, line: number, avoided: string, preferred: string) => ({
  rule: "preferred-term",
  level: "warning",
  file,
  line,
  message: `「${avoided}」は「${preferred}」と書きます`,
});
const PREFERRED_FOUND = { "kitei.txt": [found("kitei.txt", 13, "サーバ", "サーバー")], "tebiki.md": [found("tebiki.md", 15, "サーバ", "サーバー")] };
const CONFIG = "language: ja\ngenre: technical/readme\nprefer:\n  サーバ: サーバー\nrules:\n  preferred-term: normal\n";

beforeEach(() => {
  harness.setUp();
  write("kitei.txt", KITEI);
  write("tebiki.md", TEBIKI);
  write(".blueprint/answers.json", { documents: "kitei.txt\ntebiki.md", write: "このフォルダの chaff.yaml に入れる" });
  writeFake("tree.json", {
    "kitei.txt": { kind: "doc", address: "", children: [definition("社員"), definition("テレワーク")] },
    "tebiki.md": { kind: "doc", address: "", children: [definition("社員")] },
  });
  write(".blueprint/glossary.json", GLOSSARY);
});
afterEach(() => harness.tearDown());

describeSh("glossary: collect", () => {
  it("passes the example's glossary and shows it with the spellings and what is defined twice", () => {
    expect(node("glossary.mjs", ["collect"])).toEqual({ code: 0, stderr: "" });
    const readable = readFileSync(join(harness.dir(), ".blueprint", "glossary.txt"), "utf8");
    expect(readable).toContain("- 社員  [defined 2 times]");
    expect(readable).toContain("- サーバー  (サーバー / サーバ → サーバー)");
  });

  it("refuses a glossary that leaves out a term a document defines, and a quotation chaff cannot find", () => {
    write(".blueprint/glossary.json", { terms: GLOSSARY.terms.filter((entry) => entry.term !== "テレワーク") });
    expect(node("glossary.mjs", ["collect"]).stderr).toContain("kitei.txt defines 「テレワーク」");
    write(".blueprint/glossary.json", GLOSSARY);
    writeFake("cite.json", { "tebiki.md": 1 });
    expect(node("glossary.mjs", ["collect"]).stderr).toContain("quotations from tebiki.md are not in it");
  });
});

describeSh("glossary: apply", () => {
  it("passes when chaff.yaml carries the spellings and chaff reports what the documents still spell otherwise", () => {
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write("chaff.yaml", CONFIG);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", PREFERRED_FOUND);
    expect(node("glossary.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
  });

  it("refuses chaff.yaml that chaff does not report the avoided spelling under, or with preferred-term off", () => {
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write("chaff.yaml", CONFIG);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", { "tebiki.md": PREFERRED_FOUND["tebiki.md"] });
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("kitei.txt still writes 「サーバ」, but chaff does not report it");
    writeFake("rules.json", RULES("off"));
    writeFake("findings.json", PREFERRED_FOUND);
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("preferred-term is off");
  });

  it("wants each spelling reported for itself: another pair's finding in the same file is no proof", () => {
    const userName = {
      term: "ユーザー名",
      spellings: [
        { spelling: "ユーザー名", citations: [cite("tebiki.md", "h1.2", "ユーザー名とパスワード")] },
        { spelling: "ユーザ名", citations: [cite("tebiki.md", "h1.3", "ユーザ名を忘れた")] },
      ],
      preferred: "ユーザー名",
    };
    write(".blueprint/glossary.json", { terms: [...GLOSSARY.terms, userName] });
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write("chaff.yaml", CONFIG);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", PREFERRED_FOUND);
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("tebiki.md still writes 「ユーザ名」, but chaff does not report it");
    writeFake("findings.json", { ...PREFERRED_FOUND, "tebiki.md": [...PREFERRED_FOUND["tebiki.md"], found("tebiki.md", 15, "ユーザ名", "ユーザー名")] });
    expect(node("glossary.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
  });

  it("asks no report of a document that writes the avoided spelling only inside the preferred one", () => {
    write("tebiki.md", TEBIKI.replaceAll("サーバにつながらない", "サーバーにつながらない"));
    write(".blueprint/glossary.json", GLOSSARY);
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write("chaff.yaml", CONFIG);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", { "kitei.txt": PREFERRED_FOUND["kitei.txt"] });
    expect(node("glossary.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
  });

  it("refuses chaff.yaml that lost a line the team had, or is missing", () => {
    write("chaff.yaml", "language: ja\njargon:\n  - 横展開\n");
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write("chaff.yaml", CONFIG);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", PREFERRED_FOUND);
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("chaff.yaml lost a line it had: - 横展開");
  });

  it("refuses jargon mentioned elsewhere in chaff.yaml but not listed under jargon", () => {
    const withJargon = {
      terms: [
        ...GLOSSARY.terms,
        { term: "横展開", jargon: true, spellings: [{ spelling: "横展開", citations: [cite("tebiki.md", "h1.3", "チームに横展開してください")] }] },
      ],
    };
    write(".blueprint/glossary.json", withJargon);
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    writeFake("rules.json", RULES("normal"));
    writeFake("findings.json", PREFERRED_FOUND);
    write("chaff.yaml", `${CONFIG}# 横展開 is jargon\n`);
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("chaff.yaml does not list the jargon 「横展開」");
    write("chaff.yaml", `${CONFIG}jargon:\n  - 横展開\n`);
    expect(node("glossary.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
  });

  it("leaves chaff.yaml alone when the person kept the glossary under .blueprint, and refuses a change", () => {
    write(".blueprint/answers.json", { documents: "kitei.txt\ntebiki.md", write: "入れない（.blueprint の中だけ）" });
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    expect(node("glossary.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
    write("chaff.yaml", CONFIG);
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("chaff.yaml changed, but the person chose to keep the glossary under .blueprint only");
  });

  it("refuses when the glossary changed after the collect step checked it", () => {
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
    write(".blueprint/glossary.json", { ...GLOSSARY, note: "edited" });
    expect(node("glossary.mjs", ["apply"]).stderr).toContain("changed since the collect step checked it");
  });
});

describeSh("glossary: the report", () => {
  const REPORT = "## 用語集\n\n| 社員 | テレワーク | サーバー |\n\n## 二重定義\n\n「社員」は二つの文書で違う。\n\n## 確かめたこと\n\n機械で確かめた。\n";

  beforeEach(() => {
    expect(node("glossary.mjs", ["collect"]).code).toBe(0);
  });

  it("passes when it names every term, and the term defined twice where it says so", () => {
    write(".blueprint/glossary-report.md", REPORT);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
  });

  it("refuses a term named only inside a longer word, and a report without the part on double definitions", () => {
    write(".blueprint/glossary-report.md", REPORT.replace("| 社員 |", "| 正社員 |"));
    expect(node("report.mjs").stderr).toContain("the glossary section does not name: 社員");
    write(".blueprint/glossary-report.md", REPORT.replace("## 二重定義\n\n「社員」は二つの文書で違う。\n\n", ""));
    expect(node("report.mjs").stderr).toContain("lacks sections: 二重定義 / Defined twice");
  });
});
