// @vitest-environment node
// The document packs' checks decide when a style counts as written down, so they are run here for real:
// in a scratch folder holding the files a build would write. chaff is a stand-in that answers from a
// table (CHAFF_BIN), so the checks are judged on what they do with chaff's output — never on the network
// or on whichever chaff version is published today.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRecord } from "../../../common/isRecord";

// Every check here runs through /bin/sh (the packs' checks are shell and chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const PACKS = join(import.meta.dirname, "..", "..", "..", "blueprints");
const BASE = join(PACKS, "docs");
const USECASE = join(PACKS, "style");

let dir: string;
let fake: string;

const write = (file: string, content: unknown): void => {
  writeFileSync(join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
};
const writeFake = (file: string, content: unknown): void => {
  writeFileSync(join(fake, file), typeof content === "string" ? content : JSON.stringify(content));
};

// The stand-in: `rules --json` prints rules.json (exit code from rules.code); `<target> --sarif <path>`
// writes the findings listed for that target in findings.json as SARIF.
const FAKE_CHAFF = `
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.env.FAKE_CHAFF;
const args = process.argv.slice(2);
if (args[0] === "rules") {
  const code = existsSync(join(dir, "rules.code")) ? Number(readFileSync(join(dir, "rules.code"), "utf8")) : 0;
  if (code !== 0) { console.error("chaff: broken config"); process.exit(code); }
  process.stdout.write(readFileSync(join(dir, "rules.json"), "utf8"));
  process.exit(0);
}
const findings = existsSync(join(dir, "findings.json")) ? JSON.parse(readFileSync(join(dir, "findings.json"), "utf8")) : {};
const listed = findings[args[0]] ?? [];
const results = listed.map((f) => ({ ruleId: "chaff/" + f.rule, level: f.level, locations: [{ physicalLocation: { artifactLocation: { uri: f.file } } }] }));
writeFileSync(args[args.indexOf("--sarif") + 1], JSON.stringify({ runs: [{ tool: {}, results }] }));
`;

function run(command: string, args: string[]): { code: number; stderr: string } {
  try {
    execFileSync(command, args, {
      cwd: dir,
      env: { ...process.env, BLUEPRINT_BASE: BASE, BLUEPRINT_USECASE: USECASE, FAKE_CHAFF: fake, CHAFF_BIN: `node ${join(fake, "chaff.mjs")}` },
      stdio: "pipe",
    });
    return { code: 0, stderr: "" };
  } catch (err) {
    if (!isRecord(err)) return { code: 1, stderr: String(err) };
    return { code: typeof err.status === "number" ? err.status : 1, stderr: Buffer.isBuffer(err.stderr) ? err.stderr.toString() : "" };
  }
}

const node = (script: string) => run(process.execPath, [join(USECASE, "checks", script)]);

type Rule = { id: string; your_setting?: { level: string; from: string } };
const rule = (id: string, level?: string): Rule => (level === undefined ? { id } : { id, your_setting: { level, from: join("/x", "chaff.yaml") } });
const rulesJson = (rules: Rule[], detected: Record<string, string> = { genre: "technical/spec", language: "ja" }) =>
  writeFake("rules.json", { detected, rules });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bp-style-"));
  fake = mkdtempSync(join(tmpdir(), "bp-chaff-"));
  mkdirSync(join(dir, ".blueprint"));
  writeFake("chaff.mjs", FAKE_CHAFF);
  rulesJson([rule("sentence-length"), rule("heading-echo")]);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(fake, { recursive: true, force: true });
});

describeSh("docs: workspace.sh", () => {
  const workspace = () => run("/bin/sh", [join(BASE, "checks", "workspace.sh")]);

  it("passes when .blueprint/ is here and chaff runs", () => {
    expect(workspace().code).toBe(0);
  });

  it("fails without .blueprint/", () => {
    rmSync(join(dir, ".blueprint"), { recursive: true });
    expect(workspace()).toMatchObject({ code: 1, stderr: expect.stringContaining(".blueprint") });
  });

  it("fails, with chaff's own message, when chaff cannot load the config", () => {
    writeFake("rules.code", "2");
    expect(workspace()).toMatchObject({ code: 1, stderr: expect.stringContaining("broken config") });
  });

  it("in a git repository, fails until .blueprint/ is excluded locally", () => {
    expect(run("/bin/sh", ["-c", "git init -q"]).code).toBe(0);
    write(".blueprint/answers.json", "{}");
    expect(workspace()).toMatchObject({ code: 1, stderr: expect.stringContaining(".git/info/exclude") });
    writeFileSync(join(dir, ".git", "info", "exclude"), ".blueprint/\n");
    expect(workspace().code).toBe(0);
  });
});

describeSh("style: sources.mjs", () => {
  const LONG = "手本の文章。".repeat(200);
  beforeEach(() => {
    mkdirSync(join(dir, ".blueprint", "sources"));
    write(".blueprint/sources/a.md", LONG);
    write(".blueprint/sources/b.md", LONG);
    write(".blueprint/sources.json", [
      { file: "a.md", origin: "https://example.com/a" },
      { file: "b.md", origin: "docs/b.md" },
    ]);
  });

  it("passes with two listed Markdown sources and enough text", () => {
    expect(node("sources.mjs").code).toBe(0);
  });

  it.each([
    ["no list", () => rmSync(join(dir, ".blueprint", "sources.json")), "sources.json"],
    ["a list that is not JSON", () => write(".blueprint/sources.json", "[{"), "not JSON"],
    [
      "an entry without an origin",
      () =>
        write(".blueprint/sources.json", [
          { file: "a.md", origin: "" },
          { file: "b.md", origin: "x" },
        ]),
      "origin",
    ],
    ["a listed file that is not there", () => rmSync(join(dir, ".blueprint", "sources", "b.md")), "b.md"],
    ["a file nobody listed", () => write(".blueprint/sources/c.md", LONG), "c.md"],
    ["an empty source", () => write(".blueprint/sources/b.md", " \n "), "empty"],
    [
      "one source only, however long",
      () => {
        rmSync(join(dir, ".blueprint", "sources", "b.md"));
        write(".blueprint/sources/a.md", LONG.repeat(4));
        write(".blueprint/sources.json", [{ file: "a.md", origin: "x" }]);
      },
      "at least 2",
    ],
    [
      "too little text",
      () => {
        write(".blueprint/sources/a.md", "短い。");
        write(".blueprint/sources/b.md", "短い。");
      },
      "characters",
    ],
  ])("fails with %s", (_label, arrange, message) => {
    arrange();
    expect(node("sources.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });

  it("does not accept a non-Markdown source", () => {
    write(".blueprint/sources/a.txt", LONG);
    write(".blueprint/sources.json", [
      { file: "a.txt", origin: "x" },
      { file: "b.md", origin: "x" },
    ]);
    rmSync(join(dir, ".blueprint", "sources", "a.md"));
    expect(node("sources.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("Markdown") });
  });
});

describeSh("style: rules.mjs", () => {
  const GUIDE_JA = ["# 手引き", "## 誰に・何のために", "## 語調と文末", "## 用語と表記", "## 構成", "## 機械が確かめること", ""].join("\n");
  beforeEach(() => {
    write("chaff.yaml", "genre: technical/spec\nlanguage: ja\nrules:\n  sentence-length: relaxed\n");
    rulesJson([rule("sentence-length", "relaxed"), rule("heading-echo")]);
    write(".blueprint/rule-decisions.json", { "sentence-length": { level: "relaxed", why: "手本は定義文が長い" } });
    write("STYLE.md", GUIDE_JA);
    writeFake("findings.json", { ".blueprint/sources": [{ rule: "ai-tell", level: "info", file: ".blueprint/sources/a.md" }] });
  });

  it("passes when every setting has a reason, the sources raise nothing actionable, and the guide has its sections", () => {
    expect(node("rules.mjs").code).toBe(0);
  });

  it("accepts the guide's sections in English", () => {
    write("STYLE.md", ["## Audience and purpose", "## Voice and tone", "## Terms and spelling", "## Structure", "## What chaff checks"].join("\n"));
    expect(node("rules.mjs").code).toBe(0);
  });

  it.each([
    ["no chaff.yaml", () => rmSync(join(dir, "chaff.yaml")), "chaff.yaml is missing"],
    ["a config chaff cannot load", () => writeFake("rules.code", "2"), "could not load"],
    ["no genre", () => rulesJson([rule("sentence-length", "relaxed")], { language: "ja" }), "genre and language"],
    [
      "a setting with no recorded reason",
      () => rulesJson([rule("sentence-length", "relaxed"), rule("heading-echo", "off")]),
      "heading-echo: set in chaff.yaml without a recorded reason",
    ],
    [
      "a decision chaff did not apply (a misspelt rule)",
      () => write(".blueprint/rule-decisions.json", { "sentence-length": { level: "relaxed", why: "x" }, "heading-echo": { level: "off", why: "y" } }),
      'heading-echo: decided "off", but chaff.yaml gives "nothing"',
    ],
    [
      "a decision for a rule chaff does not have",
      () => write(".blueprint/rule-decisions.json", { "sentence-length": { level: "relaxed", why: "x" }, "no-such-rule": { level: "off", why: "y" } }),
      "no-such-rule: chaff has no such rule",
    ],
    [
      "a decision with an empty reason",
      () => write(".blueprint/rule-decisions.json", { "sentence-length": { level: "relaxed", why: " " } }),
      "no reason given",
    ],
    ["decisions that are not an object", () => write(".blueprint/rule-decisions.json", []), "object keyed by rule"],
    [
      "a source that breaks its own style",
      () => writeFake("findings.json", { ".blueprint/sources": [{ rule: "sentence-length", level: "warning", file: ".blueprint/sources/a.md" }] }),
      "a.md: sentence-length (warning)",
    ],
    ["no guide", () => rmSync(join(dir, "STYLE.md")), "STYLE.md is missing"],
    ["a guide without its structure section", () => write("STYLE.md", GUIDE_JA.replace("## 構成\n", "")), "構成 / Structure"],
  ])("fails with %s", (_label, arrange, message) => {
    arrange();
    expect(node("rules.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining(message) });
  });
});

describeSh("style: counter.mjs", () => {
  beforeEach(() => {
    mkdirSync(join(dir, ".blueprint", "counter"));
    write(".blueprint/counter/a.md", "x");
    write(".blueprint/counter/b.md", "y");
    write(".blueprint/counter.json", [
      { file: "a.md", breaks: "語調と文末" },
      { file: "b.md", breaks: "構成" },
    ]);
    writeFake("findings.json", {
      ".blueprint/counter": [
        { rule: "sentence-length", level: "warning", file: ".blueprint/counter/a.md" },
        { rule: "sentence-ending", level: "warning", file: ".blueprint/counter/a.md" },
        { rule: "heading-echo", level: "error", file: ".blueprint/counter/b.md" },
      ],
    });
  });

  it("passes when chaff finds something in every text and at least three rules fire", () => {
    expect(node("counter.mjs").code).toBe(0);
  });

  it("names a counter text chaff found nothing in", () => {
    write(".blueprint/counter/c.md", "z");
    write(".blueprint/counter.json", [
      { file: "a.md", breaks: "x" },
      { file: "b.md", breaks: "y" },
      { file: "c.md", breaks: "z" },
    ]);
    expect(node("counter.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("found nothing in: c.md") });
  });

  it("does not count an info note as the style biting", () => {
    writeFake("findings.json", {
      ".blueprint/counter": [
        { rule: "sentence-length", level: "warning", file: ".blueprint/counter/a.md" },
        { rule: "ai-tell", level: "info", file: ".blueprint/counter/b.md" },
      ],
    });
    expect(node("counter.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("b.md") });
  });

  it("wants at least three different rules", () => {
    writeFake("findings.json", {
      ".blueprint/counter": [
        { rule: "sentence-length", level: "warning", file: ".blueprint/counter/a.md" },
        { rule: "sentence-length", level: "warning", file: ".blueprint/counter/b.md" },
      ],
    });
    expect(node("counter.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("only 1 rule") });
  });

  it("wants to know what each text breaks", () => {
    write(".blueprint/counter.json", [{ file: "a.md", breaks: "" }]);
    expect(node("counter.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining('"breaks"') });
  });
});

describeSh("style: report.sh", () => {
  const report = () => run("/bin/sh", [join(USECASE, "checks", "report.sh")]);

  it("passes with the three sections, in either language", () => {
    write(".blueprint/style-report.md", "# 報告\n## 機械の決まり\n## 手引き\n## 規約にしなかったこと\n");
    expect(report().code).toBe(0);
    write(".blueprint/style-report.md", "## Machine rules\n## The guide\n## Left out\n");
    expect(report().code).toBe(0);
  });

  it.each(["機械の決まり", "手引き", "規約にしなかったこと"])("names %s when it is missing", (missing) => {
    const sections = ["機械の決まり", "手引き", "規約にしなかったこと"].filter((section) => section !== missing);
    write(".blueprint/style-report.md", sections.map((section) => `## ${section}`).join("\n"));
    expect(report()).toMatchObject({ code: 1, stderr: expect.stringContaining(missing) });
  });
});

describeSh("style: the counter step's check", () => {
  // The step may change chaff.yaml to make the style bite, so its check re-runs the rules check first.
  const counterStep = (): string => {
    const steps: unknown = JSON.parse(readFileSync(join(USECASE, "steps.json"), "utf8"));
    const list = isRecord(steps) && Array.isArray(steps.steps) ? steps.steps : [];
    const step: unknown = list.find((entry: unknown) => isRecord(entry) && entry.id === "counter");
    return isRecord(step) && typeof step.check === "string" ? step.check : "";
  };

  it("fails when a change made the models break their own style, even though the counter texts are caught", () => {
    write("chaff.yaml", "genre: technical/spec\nlanguage: ja\n");
    write("STYLE.md", ["## 誰に・何のために", "## 語調と文末", "## 用語と表記", "## 構成", "## 機械が確かめること"].join("\n"));
    write(".blueprint/rule-decisions.json", {});
    mkdirSync(join(dir, ".blueprint", "counter"));
    write(".blueprint/counter/a.md", "x");
    write(".blueprint/counter.json", [{ file: "a.md", breaks: "語調と文末" }]);
    const counterFindings = ["sentence-length", "sentence-ending", "heading-echo"].map((rule) => ({ rule, level: "warning", file: ".blueprint/counter/a.md" }));
    writeFake("findings.json", { ".blueprint/counter": counterFindings, ".blueprint/sources": [] });
    expect(run("/bin/sh", ["-c", counterStep()]).code).toBe(0);
    writeFake("findings.json", {
      ".blueprint/counter": counterFindings,
      ".blueprint/sources": [{ rule: "sentence-ending", level: "warning", file: ".blueprint/sources/a.md" }],
    });
    expect(run("/bin/sh", ["-c", counterStep()])).toMatchObject({ code: 1, stderr: expect.stringContaining("break their own style") });
  });
});
