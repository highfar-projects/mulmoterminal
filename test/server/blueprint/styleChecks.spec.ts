// @vitest-environment node
// The document packs' checks decide when a style counts as written down, so they are run here for real:
// in a scratch folder holding the files a build would write. chaff is a stand-in that answers from a
// table (CHAFF_BIN), so the checks are judged on what they do with chaff's output — never on the network
// or on whichever chaff version is published today.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRecord } from "../../../common/isRecord";
import { BASE, PACKS, docsPackHarness } from "./docsPackHarness";

// Every check here runs through /bin/sh (the packs' checks are shell and chaff.sh), which Windows lacks.
const describeSh = describe.skipIf(process.platform === "win32");

const USECASE = join(PACKS, "style");
const harness = docsPackHarness("style");
const { write, writeFake, run } = harness;

let dir: string;

const node = (script: string) => harness.node(script);

type Rule = { id: string; your_setting?: { level: string; from: string } };
const rule = (id: string, level?: string): Rule => (level === undefined ? { id } : { id, your_setting: { level, from: join("/x", "chaff.yaml") } });
const rulesJson = (rules: Rule[], detected: Record<string, string> = { genre: "technical/spec", language: "ja" }) =>
  writeFake("rules.json", { detected, rules });

beforeEach(() => {
  harness.setUp();
  dir = harness.dir();
  rulesJson([rule("sentence-length"), rule("heading-echo")]);
});
afterEach(() => harness.tearDown());

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

  it("in a git worktree, where .git is a file, asks git rather than the folder", () => {
    const origin = mkdtempSync(join(tmpdir(), "bp-origin-"));
    const setup = [
      `git -C "${origin}" init -q`,
      `git -C "${origin}" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init`,
      `git -C "${origin}" worktree add -q "${join(dir, "wt")}"`,
    ].join(" && ");
    expect(run("/bin/sh", ["-c", setup]).code).toBe(0);
    mkdirSync(join(dir, "wt", ".blueprint"));
    writeFileSync(join(dir, "wt", ".blueprint", "answers.json"), "{}");
    const inWorktree = () => run("/bin/sh", ["-c", `cd wt && sh "${join(BASE, "checks", "workspace.sh")}"`]);
    expect(inWorktree()).toMatchObject({ code: 1, stderr: expect.stringContaining(".git/info/exclude") });
    rmSync(origin, { recursive: true, force: true });
  });

  it("fails when .blueprint/ is already tracked, even though excluded", () => {
    const setup = [
      "git init -q",
      "printf '{}' > .blueprint/answers.json",
      "git add .blueprint/answers.json",
      "printf '.blueprint/\\n' >> .git/info/exclude",
    ].join(" && ");
    expect(run("/bin/sh", ["-c", setup]).code).toBe(0);
    expect(workspace()).toMatchObject({ code: 1, stderr: expect.stringContaining("tracked") });
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

  it("counts one file once, however many times it is listed", () => {
    write(".blueprint/sources.json", [
      { file: "a.md", origin: "x" },
      { file: "a.md", origin: "y" },
      { file: "b.md", origin: "z" },
    ]);
    expect(node("sources.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("listed more than once: a.md") });
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
  const GUIDE_SECTIONS_JA = ["誰に・何のために", "語調と文末", "用語と表記", "構成", "機械が確かめること"];
  const guide = (sections: readonly string[], empty: string | undefined = undefined): string =>
    ["# 手引き", ...sections.flatMap((section) => [`## ${section}`, section === empty ? "" : `${section}の決まり。`])].join("\n");
  const GUIDE_JA = guide(GUIDE_SECTIONS_JA);
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
    write("STYLE.md", guide(["Audience and purpose", "Voice and tone", "Terms and spelling", "Structure", "What chaff checks"]));
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
    ["a guide without its structure section", () => write("STYLE.md", guide(GUIDE_SECTIONS_JA.filter((section) => section !== "構成"))), "構成 / Structure"],
    ["a guide whose section is only a heading", () => write("STYLE.md", guide(GUIDE_SECTIONS_JA, "用語と表記")), "用語と表記 / Terms and spelling (empty)"],
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

  it("does not credit a finding in za.md to a.md", () => {
    write(".blueprint/counter/za.md", "z");
    write(".blueprint/counter.json", [
      { file: "a.md", breaks: "x" },
      { file: "za.md", breaks: "y" },
    ]);
    writeFake("findings.json", {
      ".blueprint/counter": ["sentence-length", "sentence-ending", "heading-echo"].map((rule) => ({
        rule,
        level: "warning",
        file: ".blueprint/counter/za.md",
      })),
    });
    expect(node("counter.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("found nothing in: a.md") });
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

describeSh("style: report.mjs", () => {
  const SECTIONS = ["機械の決まり", "手引き", "規約にしなかったこと"];
  const report = (sections: readonly string[], empty: string | undefined = undefined) =>
    write(".blueprint/style-report.md", ["# 報告", ...sections.flatMap((section) => [`## ${section}`, section === empty ? "" : "中身。"])].join("\n"));

  it("passes with the three sections written, in either language", () => {
    report(SECTIONS);
    expect(node("report.mjs").code).toBe(0);
    report(["Machine rules", "The guide", "Left out"]);
    expect(node("report.mjs").code).toBe(0);
  });

  it.each(SECTIONS)("names %s when it is missing", (missing) => {
    report(SECTIONS.filter((section) => section !== missing));
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining(missing) });
  });

  it("does not accept a section that is only a heading", () => {
    report(SECTIONS, "手引き");
    expect(node("report.mjs")).toMatchObject({ code: 1, stderr: expect.stringContaining("手引き / The guide (empty)") });
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
    write(
      "STYLE.md",
      ["誰に・何のために", "語調と文末", "用語と表記", "構成", "機械が確かめること"].map((section) => `## ${section}\n${section}の決まり。`).join("\n"),
    );
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
