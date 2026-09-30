// @vitest-environment node
// The adopt pack's checks, run for real against a stand-in chaff (docsPackHarness) over the shipped example. The
// survey's count is measured again; the setup is refused unless chaff.yaml names the genre and keeps its lines, the
// baseline shelves what was there, chaff reports nothing left, and the workflow is there only when asked for.
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsPackHarness, PACKS } from "./docsPackHarness";

// The checks run chaff through /bin/sh (chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const harness = docsPackHarness("adopt");
const { write, writeFake, node } = harness;
const EXAMPLE = join(PACKS, "adopt", "presets", "help-pages");
const TEMPLATE = readFileSync(join(PACKS, "adopt", "templates", "chaff.yml"), "utf8");
const long = (file: string) => ({ rule: "max-sentence-length", level: "warning", file, line: 5 });
const TODAY = { "login.md": [long("login.md")], "export.md": [long("export.md")] };
const WITH_CI = { places: "login.md\nexport.md", kind: "手順書・ヘルプ・マニュアル", ci: "GitHub の PR に指摘を出すワークフローを作る" };
const RULES = (genre: string) => ({ schema_version: 1, detected: { genre, language: "ja" }, rules: [] });
const REPORT =
  "## 入れたもの\n\nchaff.yaml と .chaff-baseline.json と .github/workflows/chaff.yml。\n\n## 棚に上げた指摘\n\n2 件。\n\n## これから\n\n新しい指摘だけが出る。\n";

const setUpChaff = (baselineEntries: number) => {
  write("chaff.yaml", "genre: docs/manual\nlanguage: ja\n");
  write(".chaff-baseline.json", { version: 1, entries: Array.from({ length: baselineEntries }, (_unused, index) => String(index)) });
  writeFake("rules.json", RULES("docs/manual"));
  writeFake("findings.json", {});
  writeFake("shown.json", TODAY);
};
const workflow = (text = TEMPLATE.replace("{{PATHS}}", "login.md export.md")) => {
  mkdirSync(join(harness.dir(), ".github", "workflows"), { recursive: true });
  write(".github/workflows/chaff.yml", text);
};

beforeEach(() => {
  harness.setUp();
  ["login.md", "export.md"].forEach((file) => write(file, readFileSync(join(EXAMPLE, file), "utf8")));
  write(".blueprint/answers.json", WITH_CI);
  writeFake("findings.json", TODAY);
});
afterEach(() => harness.tearDown());

describeSh("adopt: the survey", () => {
  it("passes when the recorded count is what chaff reports as the chosen genre, and shows it by rule", () => {
    write(".blueprint/adopt.json", { genre: "docs/manual", findings: 2 });
    expect(node("adopt.mjs", ["survey"])).toEqual({ code: 0, stderr: "" });
    expect(readFileSync(join(harness.dir(), ".blueprint", "adopt.txt"), "utf8")).toBe("genre: docs/manual\nfindings: 2\n  max-sentence-length: 2\n");
    expect(readFileSync(join(harness.fake(), "lint.log"), "utf8")).toContain("--genre docs/manual");
  });

  it.each<[string, Record<string, unknown>, Record<string, unknown>, string]>([
    ["a count chaff does not report", {}, { genre: "docs/manual", findings: 5 }, '"findings" is 5, but chaff reports 2'],
    ["another genre than the kind's", {}, { genre: "blog/tech", findings: 2 }, '"genre" must be docs/manual'],
    ["a kind the pack does not know", { kind: "詩" }, { genre: "docs/manual", findings: 2 }, "is not one of the kinds"],
    ["a place outside the folder", { places: "../elsewhere" }, { genre: "docs/manual", findings: 2 }, "outside this folder: ../elsewhere"],
    ["a place that is not there", { places: "missing.md" }, { genre: "docs/manual", findings: 2 }, "not in this folder: missing.md"],
  ])("refuses %s", (_label, answers, record, message) => {
    write(".blueprint/answers.json", { ...WITH_CI, ...answers });
    write(".blueprint/adopt.json", record);
    expect(node("adopt.mjs", ["survey"]).stderr).toContain(message);
  });
});

describeSh("adopt: the setup", () => {
  beforeEach(() => {
    write(".blueprint/adopt.json", { genre: "docs/manual", findings: 2 });
    expect(node("adopt.mjs", ["survey"]).code).toBe(0);
  });

  it("passes when chaff.yaml, the baseline and the workflow are there and chaff reports nothing left, and the report names them", () => {
    setUpChaff(2);
    workflow();
    expect(node("adopt.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
    write(".blueprint/adopt-report.md", REPORT);
    expect(node("report.mjs")).toEqual({ code: 0, stderr: "" });
    write(".blueprint/adopt-report.md", REPORT.replace(" と .github/workflows/chaff.yml", ""));
    expect(node("report.mjs").stderr).toContain("does not name: .github/workflows/chaff.yml");
  });

  it("refuses findings the baseline did not shelve, a baseline shelving fewer than measured, or none", () => {
    setUpChaff(2);
    workflow();
    writeFake("findings.json", TODAY);
    expect(node("adopt.mjs", ["apply"]).stderr).toContain("chaff still reports 2 finding(s) the baseline does not shelve: max-sentence-length 2");
    setUpChaff(1);
    expect(node("adopt.mjs", ["apply"]).stderr).toContain("shelves 1 finding(s), fewer than the 2 measured");
    rmSync(join(harness.dir(), ".chaff-baseline.json"));
    expect(node("adopt.mjs", ["apply"]).stderr).toContain(".chaff-baseline.json is missing");
  });

  it("refuses a shelf that is not the survey's: settings that drop findings, or a baseline taken under another genre", () => {
    setUpChaff(2);
    workflow();
    writeFake("shown.json", { "login.md": [long("login.md")] });
    expect(node("adopt.mjs", ["apply"]).stderr).toContain("with its baseline shown, chaff reports 1 finding(s) under chaff.yaml, not the 2 measured");
  });

  it("refuses chaff.yaml naming another genre, and one that lost a line the folder had", () => {
    write("chaff.yaml", "genre: blog/tech\nprefer:\n  サーバ: サーバー\n");
    write(".blueprint/adopt.json", { genre: "docs/manual", findings: 2 });
    expect(node("adopt.mjs", ["survey"]).code).toBe(0);
    setUpChaff(2);
    workflow();
    writeFake("rules.json", RULES("blog/tech"));
    const refused = node("adopt.mjs", ["apply"]).stderr;
    expect(refused).toContain("chaff.yaml gives genre blog/tech, not docs/manual");
    expect(refused).toContain("chaff.yaml lost a line it had: サーバ: サーバー");
  });

  it("refuses a workflow that takes more than it needs, and one that is missing when asked for", () => {
    setUpChaff(2);
    expect(node("adopt.mjs", ["apply"]).stderr).toContain(".github/workflows/chaff.yml is missing");
    workflow(TEMPLATE.replace("{{PATHS}}", "login.md export.md").replace("contents: read\n\njobs:", "contents: write\n\njobs:"));
    expect(node("adopt.mjs", ["apply"]).stderr).toContain("it is not the pack's template filled in with the places (first difference at line 9)");
  });

  it("adds no workflow when the person chose none", () => {
    write(".blueprint/answers.json", { ...WITH_CI, ci: "作らない（手元で npx chaffjs を動かす）" });
    setUpChaff(2);
    expect(node("adopt.mjs", ["apply"])).toEqual({ code: 0, stderr: "" });
    workflow();
    expect(node("adopt.mjs", ["apply"]).stderr).toContain("was added, but the person chose no workflow");
    expect(existsSync(join(harness.dir(), ".github", "workflows", "chaff.yml"))).toBe(true);
  });
});
