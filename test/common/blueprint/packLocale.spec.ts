// A pack's locale overlay: it replaces words and never a value, and it is held to cover the pack exactly.
import { describe, expect, it } from "vitest";
import {
  localizedHearing,
  localizedManifest,
  localizedPreset,
  localizedSteps,
  overlayLanguage,
  overlayProblems,
  type Described,
  type PackLocale,
} from "../../../common/blueprint/packLocale";
import { blueprintManifestSchema } from "../../../common/blueprint/manifest";
import { hearingSchema } from "../../../common/blueprint/hearing";
import type { ComposedStep } from "../../../common/blueprint/plan";

const manifest = blueprintManifestSchema.parse({
  slug: "polish",
  kind: "usecase",
  title: "文書を整える",
  version: "0.1.0",
  description: "整える",
  bases: ["docs"],
});
const hearing = hearingSchema.parse({
  questions: [
    { id: "style", label: "どの規約", why: "合わせる", kind: "select", options: ["この規約", "既定"] },
    { id: "limit", label: "上限", why: "区切る", kind: "number" },
  ],
});
const step = (id: string, origin: "base" | "usecase"): ComposedStep => ({
  id,
  title: `工程${id}`,
  description: "説明",
  skill: "s",
  check: "true",
  gates: [],
  reads: [],
  origin,
});
const overlay: PackLocale = {
  manifest: { title: "Polish", description: "Polishes" },
  hearing: {
    style: { label: "Which style", why: "To follow", options: { この規約: "This style", 既定: "Defaults" } },
    limit: { label: "Most files", why: "Keeps a run small" },
  },
  steps: { survey: { title: "Choose", description: "Chooses" } },
  presets: { blog: { title: "A blog post" } },
};

describe("overlayLanguage", () => {
  it("reads the packs as written in Japanese and with no language, and English in every other", () => {
    expect(overlayLanguage("ja")).toBeNull();
    expect(overlayLanguage(undefined)).toBeNull();
    expect(["en", "ko", "zh-CN", "zh-TW"].map(overlayLanguage)).toEqual(["en", "en", "en", "en"]);
  });
});

describe("laying an overlay over a pack", () => {
  it("changes the words of the title, questions, steps and examples, and keeps every value", () => {
    expect(localizedManifest(manifest, overlay)).toMatchObject({ slug: "polish", title: "Polish", description: "Polishes" });
    const [style, limit] = localizedHearing(hearing, overlay).questions;
    expect(style).toMatchObject({
      id: "style",
      label: "Which style",
      why: "To follow",
      options: ["この規約", "既定"],
      optionLabels: { この規約: "This style", 既定: "Defaults" },
    });
    expect(limit).toMatchObject({ label: "Most files", why: "Keeps a run small" });
    expect(limit.optionLabels).toBeUndefined();
    expect(localizedPreset({ id: "blog", title: "ブログ", description: "説明", base: "docs", answers: {} }, overlay)).toMatchObject({
      title: "A blog post",
      description: "説明",
    });
  });

  it("keeps what the pack wrote where the overlay has no words, and with no overlay", () => {
    expect(localizedManifest(manifest, { manifest: { title: "Polish" } }).description).toBe("整える");
    expect(localizedManifest(manifest, null)).toEqual(manifest);
    expect(localizedHearing(hearing, null)).toEqual(hearing);
    expect(localizedHearing(hearing, { hearing: { style: { label: "Which style" } } }).questions[0]).toMatchObject({ label: "Which style", why: "合わせる" });
  });

  it("takes each step's words from the pack that wrote it", () => {
    const base: PackLocale = { steps: { survey: { title: "From the base" }, workspace: { title: "Workspace" } } };
    const [workspace, survey] = localizedSteps([step("workspace", "base"), step("survey", "usecase")], { base, usecase: overlay }, "docs");
    expect(workspace.title).toBe("Workspace");
    expect(survey.title).toBe("Choose");
    expect(localizedSteps([step("survey", "base")], { base: null, usecase: overlay }, "docs")[0].title).toBe("工程survey");
  });
});

describe("a step written once per base", () => {
  const perBase: PackLocale = { steps: { import: { title: "Move the records" }, "import@firebase": { title: "Move the records (emulators)" } } };

  it("takes the words written for the build's base before the step's own", () => {
    expect(localizedSteps([step("import", "usecase")], { base: null, usecase: perBase }, "firebase")[0].title).toBe("Move the records (emulators)");
    expect(localizedSteps([step("import", "usecase")], { base: null, usecase: perBase }, "local")[0].title).toBe("Move the records");
  });

  const imports = [
    { id: "import", title: "記録を移す", description: "ローカル", bases: ["local", "cloudflare"] },
    { id: "import", title: "記録を移す（エミュレータ）", description: "Firebase", bases: ["firebase"] },
  ];
  const same = [
    { id: "acceptance", title: "試験", description: "同じ", bases: ["local"] },
    { id: "acceptance", title: "試験", description: "同じ", bases: ["firebase"] },
  ];
  const problemsOf = (steps: readonly Described[], words: PackLocale["steps"]) =>
    overlayProblems({ ...overlay, steps: words }, { manifest, hearing, steps, presets: [{ id: "blog" }] });

  it("needs words for each base when the pack's versions differ, and one set when they say the same", () => {
    const each = {
      "import@local": { title: "a", description: "a" },
      "import@cloudflare": { title: "b", description: "b" },
      "import@firebase": { title: "c", description: "c" },
    };
    expect(problemsOf(imports, each)).toEqual([]);
    expect(problemsOf(imports, { import: { title: "x", description: "x" } })).toEqual([
      'no words for step "import@local" (its steps differ by base)',
      'no words for step "import@cloudflare" (its steps differ by base)',
      'no words for step "import@firebase" (its steps differ by base)',
      'words for step "import", which the pack does not have',
    ]);
    expect(problemsOf(same, { acceptance: { title: "Tests", description: "Same" } })).toEqual([]);
  });

  it("names a base the step is not written for, and words left without a description", () => {
    expect(problemsOf(same, { acceptance: { title: "Tests", description: "Same" }, "acceptance@supabase": { title: "x" } })).toEqual([
      'words for step "acceptance@supabase", which the pack does not have',
    ]);
    expect(problemsOf(same, { acceptance: { title: "Tests", description: "Same" }, "acceptance@local@typo": { title: "x" } })).toEqual([
      'words for step "acceptance@local@typo", which the pack does not have',
    ]);
    expect(problemsOf(same, { "acceptance@local": { title: "Tests" }, "acceptance@firebase": { title: "Tests", description: "d" } })).toEqual([
      'step "acceptance@local" has no description',
    ]);
  });
});

describe("overlayProblems", () => {
  const pack = { manifest, hearing, steps: [{ id: "survey", description: "選ぶ" }], presets: [{ id: "blog", description: "" }] };

  it("passes an overlay that covers the pack exactly", () => {
    expect(overlayProblems(overlay, pack)).toEqual([]);
  });

  it("names what the overlay leaves out", () => {
    const partial: PackLocale = { hearing: { style: { label: "Which style", options: { この規約: "This style" } } } };
    expect(overlayProblems(partial, pack)).toEqual([
      "no title",
      "no description",
      'no words for question "limit"',
      'no words for step "survey"',
      'no words for example "blog"',
      'question "style" needs both a label and a why',
      'no words for option of "style" "既定"',
    ]);
  });

  it("names an empty entry, and a description the pack has and the overlay does not", () => {
    const thin: PackLocale = { ...overlay, manifest: { title: "Polish" }, steps: { survey: {} }, presets: { blog: { description: "Only a description" } } };
    expect(overlayProblems(thin, pack)).toEqual([
      "no description",
      'step "survey" has no title',
      'step "survey" has no description',
      'example "blog" has no title',
    ]);
  });

  it("names words for things the pack does not have", () => {
    const stale: PackLocale = {
      ...overlay,
      hearing: {
        ...overlay.hearing,
        gone: { label: "Gone", why: "Gone" },
        style: { label: "a", why: "b", options: { この規約: "x", 既定: "y", 古い: "old" } },
      },
      steps: { ...overlay.steps, old: { title: "Old" } },
      presets: { ...overlay.presets, old: { title: "Old" } },
    };
    expect(overlayProblems(stale, pack)).toEqual([
      'words for question "gone", which the pack does not have',
      'words for step "old", which the pack does not have',
      'words for example "old", which the pack does not have',
      'words for option of "style" "古い", which the pack does not have',
    ]);
  });
});
