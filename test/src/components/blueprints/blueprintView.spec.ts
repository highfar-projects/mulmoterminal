// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  answerFromInput,
  elapsedParts,
  toolCallSummary,
  basePacks,
  gateKey,
  rejectionReason,
  stepLook,
  toggleChoice,
  usecasesFor,
  waitKey,
  type PackChoice,
  roundNumber,
  presetGroups,
  answerLines,
  toggleLine,
  runGroups,
  RUN_GROUPS,
  fitsOnALine,
} from "../../../../src/components/blueprints/blueprintView";
import { STEP_STATUSES, WAIT_KINDS } from "../../../../common/blueprint/state";
import { BLUEPRINT_GATES } from "../../../../common/blueprint/plan";
import { hearingSchema } from "../../../../common/blueprint/hearing";
import { en } from "../../../../src/i18n/en";
import { ja } from "../../../../src/i18n/ja";
import { ko } from "../../../../src/i18n/ko";
import { zhCN } from "../../../../src/i18n/zh-CN";
import { zhTW } from "../../../../src/i18n/zh-TW";

// A message key resolved against a bundle, so a key the helpers name but the bundle lacks is caught.
const lookup = (bundle: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" && part in node ? Reflect.get(node, part) : undefined), bundle);

describe("message keys the helpers name exist in the bundles", () => {
  const keys = [...STEP_STATUSES.map((status) => stepLook(status).labelKey), ...WAIT_KINDS.map((kind) => waitKey(kind) ?? ""), ...BLUEPRINT_GATES.map(gateKey)];

  it.each(keys)("%s", (key) => {
    expect(typeof lookup(en, key)).toBe("string");
    expect(typeof lookup(ja, key)).toBe("string");
  });

  it.each(Object.entries({ en, ja, ko, zhCN, zhTW }))("names every run group in %s", (_locale, bundle) => {
    RUN_GROUPS.forEach((group) => expect(typeof lookup(bundle, `blueprints.runGroups.${group}`)).toBe("string"));
  });

  // The review gate is shown before the step it lets start, so every language has to name that step.
  it.each(Object.entries({ en, ja, ko, zhCN, zhTW }))("the review gate names its step in %s", (_locale, bundle) => {
    expect(lookup(bundle, gateKey("review"))).toMatch(/\{step\}/);
  });

  it("names nothing when nothing is waited on", () => {
    expect(waitKey(null)).toBeNull();
  });
});

describe("pack choices", () => {
  const pack = (slug: string, kind: "base" | "usecase", bases: string[] = []): PackChoice => ({
    slug,
    manifest:
      kind === "base"
        ? { kind, slug, title: slug, version: "1", description: "", platform: slug, requires: [], credentials: [] }
        : { kind, slug, title: slug, version: "1", description: "", bases, next: [] },
  });
  const packs = [
    pack("firebase", "base"),
    pack("supabase", "base"),
    pack("internal", "usecase", ["firebase"]),
    pack("social", "usecase", ["firebase", "supabase"]),
  ];

  it("offers only bases as bases", () => {
    expect(basePacks(packs).map((entry) => entry.slug)).toEqual(["firebase", "supabase"]);
  });

  it("offers only the usecases that support the chosen base", () => {
    expect(usecasesFor(packs, "supabase").map((entry) => entry.slug)).toEqual(["social"]);
    expect(usecasesFor(packs, "firebase").map((entry) => entry.slug)).toEqual(["internal", "social"]);
    expect(usecasesFor(packs, "nothing")).toEqual([]);
  });
});

describe("form input", () => {
  const [text, count] = hearingSchema.parse({
    questions: [
      { id: "t", label: "t", why: "w", kind: "text" },
      { id: "n", label: "n", why: "w", kind: "number" },
    ],
  }).questions;

  it.each([
    ["blank text", text, "   ", undefined],
    ["text", text, "hello", "hello"],
    ["a number", count, "40", 40],
    ["zero", count, "0", 0],
    ["not a number", count, "forty", undefined],
    ["a blank number", count, "", undefined],
  ])("%s", (_label, question, raw, expected) => {
    expect(answerFromInput(question, raw)).toBe(expected);
  });

  it("toggles a multiselect choice on and off, whatever was there before", () => {
    expect(toggleChoice(undefined, "a")).toEqual(["a"]);
    expect(toggleChoice(["a", "b"], "a")).toEqual(["b"]);
    expect(toggleChoice("stray", "a")).toEqual(["a"]);
  });
});

describe("rejectionReason", () => {
  it("shows what a person wrote, and not the machine's word for a failed check", () => {
    expect(rejectionReason({ status: "failed", approved: false, answers: [], reason: "too expensive" })).toBe("too expensive");
    expect(rejectionReason({ status: "failed", approved: true, answers: [], reason: "check failed" })).toBeNull();
    expect(rejectionReason(undefined)).toBeNull();
  });
});

describe("toolCallSummary", () => {
  it.each([
    ["the command a Bash call runs", { command: "yarn test", description: "" }, "yarn test"],
    ["its description over the command", { command: "yarn test --run", description: "Run the tests" }, "Run the tests"],
    ["the file a Read call opens", { file_path: "/p/server/app.ts" }, "/p/server/app.ts"],
    ["a search pattern", { pattern: "TODO", path: "" }, "TODO"],
    ["a plain string input", "hello   world", "hello world"],
    ["nothing it recognises", { other: 1 }, ""],
    ["no input at all", undefined, ""],
  ])("shows %s", (_label, input, expected) => {
    expect(toolCallSummary(input)).toBe(expected);
  });

  it("keeps a long input to one short line", () => {
    const summary = toolCallSummary({ command: `echo ${"x".repeat(500)}\nnext line` });
    expect(summary.length).toBeLessThanOrEqual(120);
    expect(summary).not.toContain("\n");
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("elapsedParts", () => {
  it.each([
    [0, 0, { minutes: 0, seconds: 0 }],
    [0, 59_999, { minutes: 0, seconds: 59 }],
    [0, 133_000, { minutes: 2, seconds: 13 }],
    [5_000, 0, { minutes: 0, seconds: 0 }],
  ])("from %i to %i", (from, to, expected) => {
    expect(elapsedParts(from, to)).toEqual(expected);
  });
});

describe("stepLook motion", () => {
  it("moves only while something is happening or waiting", () => {
    expect(STEP_STATUSES.filter((status) => stepLook(status).motion !== "")).toEqual(["awaiting-approval", "running", "awaiting-answer"]);
  });
});

describe("roundNumber", () => {
  it("counts a repeating step's rounds from 1", () => {
    expect(roundNumber({ repeatWhile: "more" }, undefined)).toBe(1);
    expect(roundNumber({ repeatWhile: "more" }, {})).toBe(1);
    expect(roundNumber({ repeatWhile: "more" }, { round: 2 })).toBe(3);
  });

  it("has no round for a step that does not repeat", () => {
    expect(roundNumber({}, { round: 2 })).toBeNull();
  });
});

describe("presetGroups", () => {
  const packs: PackChoice[] = [
    {
      slug: "docs",
      manifest: { kind: "base", slug: "docs", title: "文書のフォルダ", version: "1", description: "", platform: "local", requires: [], credentials: [] },
    },
    {
      slug: "local",
      manifest: { kind: "base", slug: "local", title: "ローカル", version: "1", description: "", platform: "local", requires: [], credentials: [] },
    },
    { slug: "review", manifest: { kind: "usecase", slug: "review", title: "r", version: "1", description: "", bases: ["docs"], next: [] } },
  ];
  const preset = (id: string, base: string) => ({ id, base });

  it("puts each example under its base, bases in the selector's order, examples in theirs", () => {
    const presets = [preset("library", "local"), preset("contract", "docs"), preset("itinerary", "docs"), preset("budget", "local")];
    expect(presetGroups(presets, packs)).toEqual([
      { base: "docs", title: "文書のフォルダ", presets: [preset("contract", "docs"), preset("itinerary", "docs")] },
      { base: "local", title: "ローカル", presets: [preset("library", "local"), preset("budget", "local")] },
    ]);
  });

  it("leaves out a base with no examples, and puts an uninstalled base's examples last, under its slug", () => {
    expect(presetGroups([preset("app", "firebase"), preset("contract", "docs")], packs)).toEqual([
      { base: "docs", title: "文書のフォルダ", presets: [preset("contract", "docs")] },
      { base: "firebase", title: "firebase", presets: [preset("app", "firebase")] },
    ]);
    expect(presetGroups([], packs)).toEqual([]);
  });
});

describe("answerLines and toggleLine", () => {
  it("reads the non-blank lines, trimmed, whatever the line ending", () => {
    expect(answerLines("  a.md \r\n\n b.md\n")).toEqual(["a.md", "b.md"]);
    expect(answerLines("")).toEqual([]);
  });

  it("adds a file at the end, and takes out one already there, tidying blank lines", () => {
    expect(toggleLine("", "a.md")).toBe("a.md");
    expect(toggleLine("a.md\n", "b.md")).toBe("a.md\nb.md");
    expect(toggleLine("a.md\r\n b.md \n\nc.md", "b.md")).toBe("a.md\nc.md");
    expect(toggleLine("a.md", "a.md")).toBe("");
  });

  it("matches the whole line, not a part of it", () => {
    expect(toggleLine("notes/a.md", "a.md")).toBe("notes/a.md\na.md");
  });
});

describe("fitsOnALine", () => {
  it.each([
    ["a.md", true],
    ["docs/with space.md", true],
    ["", true],
    ["bad\nname.md", false],
    ["odd\rname.md", false],
    ["end\n", false],
  ])("%j fits: %s", (path, fits) => {
    expect(fitsOnALine(path)).toBe(fits);
  });
});

describe("runGroups", () => {
  const run = (id: string, current: string | null, waitingOn: "approval" | "answer" | "failure" | null, archived = false) => ({
    id,
    current,
    waitingOn,
    archived,
  });

  it("puts waiting builds first, running next, done last, keeping the given order inside each and leaving out empty groups", () => {
    const runs = [run("d1", null, null), run("w1", "s", "failure"), run("r1", "s", null), run("w2", "s", "approval")];
    expect(runGroups(runs).map((entry) => [entry.group, entry.runs.map((summary) => summary.id)])).toEqual([
      ["waiting", ["w1", "w2"]],
      ["working", ["r1"]],
      ["done", ["d1"]],
    ]);
    expect(runGroups([run("d1", null, null)]).map((entry) => entry.group)).toEqual(["done"]);
    expect(runGroups([])).toEqual([]);
  });

  it("puts a build away last, whatever it is waiting on, and out of every other group", () => {
    const runs = [run("a1", "s", "approval", true), run("w1", "s", "approval"), run("a2", null, null, true), run("a3", "s", null, true)];
    expect(runGroups(runs).map((entry) => [entry.group, entry.runs.map((summary) => summary.id)])).toEqual([
      ["waiting", ["w1"]],
      ["archived", ["a1", "a2", "a3"]],
    ]);
  });
});
