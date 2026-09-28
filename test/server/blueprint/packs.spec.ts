// @vitest-environment node
// The packs under blueprints/ are data that nothing else in the build opens: a misspelt gate, a
// step pointing at a skill that is not there, or a check calling a script that was renamed all
// ship green unless read here. Each pack is parsed with the same schemas the executor will use.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blueprintManifestSchema, incompatibility, type BaseManifest, type UsecaseManifest } from "../../../common/blueprint/manifest.js";
import { basePlanSchema, composePlan, usecaseStepsSchema, BLUEPRINT_GATES, type ComposedStep } from "../../../common/blueprint/plan.js";
import { answerProblems, hearingSchema, unansweredQuestions } from "../../../common/blueprint/hearing.js";
import { presetsFileSchema } from "../../../common/blueprint/presets.js";

const PACKS_DIR = join(import.meta.dirname, "..", "..", "..", "blueprints");

const readJson = (pack: string, file: string): unknown => JSON.parse(readFileSync(join(PACKS_DIR, pack, file), "utf8"));

const packDirs = readdirSync(PACKS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const manifests = packDirs.map((dir) => ({ dir, manifest: blueprintManifestSchema.parse(readJson(dir, "manifest.json")) }));
const bases = manifests.flatMap(({ dir, manifest }) => (manifest.kind === "base" ? [{ dir, manifest }] : []));
const usecases = manifests.flatMap(({ dir, manifest }) => (manifest.kind === "usecase" ? [{ dir, manifest }] : []));

// Every base/usecase pair the usecase says it supports.
const pairs = usecases.flatMap((usecase) =>
  bases.filter((base) => incompatibility(base.manifest, usecase.manifest) === null).map((base) => ({ base, usecase })),
);

const composed = (base: { dir: string }, usecase: { dir: string }): ComposedStep[] => {
  const result = composePlan(basePlanSchema.parse(readJson(base.dir, "plan.json")), usecaseStepsSchema.parse(readJson(usecase.dir, "steps.json")), base.dir);
  if (!result.ok) throw new Error(result.problems.join("; "));
  return result.steps;
};

// `$BLUEPRINT_BASE/checks/x.sh` → the script it names, in the pack the variable points at.
const SCRIPT_REF_RE = /\$(BLUEPRINT_BASE|BLUEPRINT_USECASE)\/([\w./-]+)/g;

const scriptsCalledBy = (check: string, packFor: Record<string, string>): string[] =>
  [...check.matchAll(SCRIPT_REF_RE)].map(([, variable, file]) => join(PACKS_DIR, packFor[variable] ?? "", file));

const frontmatterField = (text: string, key: string): string | undefined =>
  /^---\n([\s\S]*?)\n---(?:\n|$)/
    .exec(text)?.[1]
    ?.split("\n")
    .find((line) => line.startsWith(`${key}: `))
    ?.slice(key.length + 2);

describe("blueprint packs", () => {
  it("has at least one base, one usecase and one pair that composes", () => {
    expect(bases.length).toBeGreaterThan(0);
    expect(usecases.length).toBeGreaterThan(0);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it.each(manifests.map(({ dir, manifest }) => [dir, manifest] as const))("%s: the directory is named after its slug", (dir, manifest) => {
    expect(manifest.slug).toBe(dir);
  });

  it.each(usecases.map(({ dir }) => dir))("%s: every usecase names only bases that exist", (dir) => {
    const usecase = usecases.find((entry) => entry.dir === dir)?.manifest;
    expect(usecase?.bases.filter((slug) => !bases.some((base) => base.manifest.slug === slug))).toEqual([]);
  });

  // A usecase whose checks require a report ends with one its person should read in the run view; one that does
  // not name it in its manifest leaves them with 「完了しました」 and a hidden folder.
  it.each(usecases.map(({ dir, manifest }) => [dir, manifest] as const))("%s names the report its checks require", (dir, manifest) => {
    const checksDir = join(PACKS_DIR, dir, "checks");
    const sources = existsSync(checksDir) ? readdirSync(checksDir).map((file) => readFileSync(join(checksDir, file), "utf8")) : [];
    const required = [...new Set(sources.flatMap((source) => [...source.matchAll(/"(\.blueprint\/[A-Za-z0-9._-]+-report\.md)"/gu)].map((match) => match[1])))];
    const named = manifest.kind === "usecase" ? manifest.report : undefined;
    expect(required.length > 1 ? required : (required[0] ?? named)).toEqual(named);
  });

  it("ask names its replies page, which is its report", () => {
    const manifest = usecases.find((entry) => entry.dir === "ask")?.manifest;
    expect(manifest?.kind === "usecase" ? manifest.report : undefined).toBe(".blueprint/replies.md");
  });

  // The run view shows the report a usecase names; a name its own checks never look at is a report nobody writes.
  it.each(usecases.flatMap(({ dir, manifest }) => (manifest.kind === "usecase" && manifest.report ? [[dir, manifest.report] as const] : [])))(
    "%s: the report it names is the one its checks require",
    (dir, report) => {
      const checks = readdirSync(join(PACKS_DIR, dir, "checks")).map((file) => readFileSync(join(PACKS_DIR, dir, "checks", file), "utf8"));
      expect(checks.some((source) => source.includes(`"${report}"`))).toBe(true);
    },
  );

  it.each(usecases.map(({ dir }) => dir))("%s: the hearing parses", (dir) => {
    expect(hearingSchema.safeParse(readJson(dir, "hearing.json")).error?.issues ?? []).toEqual([]);
  });
});

describe.each(pairs.map(({ base, usecase }) => [`${base.dir} x ${usecase.dir}`, base, usecase] as const))("%s", (_label, base, usecase) => {
  const steps = composed(base, usecase);
  const packFor: Record<string, string> = { BLUEPRINT_BASE: base.dir, BLUEPRINT_USECASE: usecase.dir };
  const packOf = (step: ComposedStep): string => (step.origin === "base" ? base.dir : usecase.dir);

  it.each(steps.map((step) => [step.id, step] as const))("%s: its skill exists and names itself after the pack and step", (_id, step) => {
    const file = join(PACKS_DIR, packOf(step), step.skill, "SKILL.md");
    const text = readFileSync(file, "utf8");
    expect(frontmatterField(text, "name")).toBe(`blueprint-${packOf(step)}-${step.id}`);
    // Quoted as JSON so a colon in the sentence cannot break the YAML (see skillFrontmatter.spec.ts).
    expect(() => JSON.parse(frontmatterField(text, "description") ?? "")).not.toThrow();
  });

  it.each(steps.map((step) => [step.id, step] as const))("%s: its check calls scripts that exist", (_id, step) => {
    const scripts = scriptsCalledBy(step.check, packFor);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((script) => !existsSync(script))).toEqual([]);
  });

  it.runIf(steps[0]?.id === "spec")("writes the spec first, and has a person read it before anything else is built", () => {
    expect(steps[1]?.gates).toContain("review");
  });

  // A base that starts from someone's existing repository has no spec step of its own: its plan is
  // written later, and everything until a person approves it only looks.
  it.runIf(steps[0]?.id !== "spec")("changes nothing in the repository until a person approves the plan", () => {
    const reviewAt = steps.findIndex((step) => step.gates.includes("review"));
    expect(reviewAt).toBeGreaterThan(0);
    const writers = steps
      .slice(0, reviewAt)
      .filter((step) => !readFileSync(join(PACKS_DIR, packOf(step), step.skill, "SKILL.md"), "utf8").includes("Change nothing in the repository"));
    expect(writers.map((step) => step.id)).toEqual([]);
  });

  it.runIf(base.dir === "firebase")("stops for billing before anything is built, and publishes to production only after dev", () => {
    const ids = steps.map((step) => step.id);
    const production = steps.findIndex((step) => step.gates.includes("deploy-production"));
    expect(steps.find((step) => step.id === "projects")?.gates).toContain("billing");
    expect(production).toBeGreaterThan(ids.indexOf("deploy-dev"));
    expect(ids.indexOf("deploy-dev")).toBeGreaterThan(ids.indexOf("scaffold"));
  });

  it("uses only known gates", () => {
    expect(steps.flatMap((step) => step.gates).filter((gate) => !BLUEPRINT_GATES.includes(gate))).toEqual([]);
  });
});

// A preset is what someone clicks to watch a build happen; one that the form would refuse, or that
// names a base its usecase cannot use, is the first thing they try failing.
const presetCases = usecases.flatMap(({ dir, manifest }) => {
  const file = join(PACKS_DIR, dir, "presets.json");
  if (!existsSync(file)) return [];
  return presetsFileSchema.parse(readJson(dir, "presets.json")).presets.map((preset) => [`${dir}/${preset.id}`, dir, manifest, preset] as const);
});

describe.each(presetCases)("preset %s", (_label, dir, manifest, preset) => {
  const hearing = hearingSchema.parse(readJson(dir, "hearing.json"));

  it("is for a base the usecase supports and that exists", () => {
    expect(manifest.kind === "usecase" && manifest.bases).toContain(preset.base);
    expect(bases.map((base) => base.dir)).toContain(preset.base);
  });

  it("answers every question the form would require, with answers it would accept", () => {
    expect(unansweredQuestions(hearing, preset.answers).map((question) => question.id)).toEqual([]);
    expect(answerProblems(hearing, preset.answers)).toEqual([]);
  });

  // An example of a document blueprint is started in an empty folder: every file its answers name must arrive
  // with it as a sample, and a sample nothing names is dead weight.
  it("brings every file its answers name, and no file they do not", () => {
    const samplesDir = join(PACKS_DIR, dir, "presets", preset.id);
    const samples = existsSync(samplesDir) ? readdirSync(samplesDir).sort() : [];
    const named = ["documents", "targets", "sources"].flatMap((id) => {
      const answer = preset.answers[id];
      return typeof answer === "string"
        ? answer
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "")
        : [];
    });
    expect(named.filter((file) => !samples.includes(file))).toEqual([]);
    expect(samples.filter((file) => !named.includes(file))).toEqual([]);
  });
});

// A skill no pair ever runs is dead weight in a pack. Checked across every pair a pack takes part in:
// a usecase can carry steps for one base that another base never sees.
describe.each(packDirs.map((dir) => [dir] as const))("%s: every skill is used by some pair", (dir) => {
  it("has no skill that no composed plan uses", () => {
    const used = new Set(
      pairs
        .filter(({ base, usecase }) => base.dir === dir || usecase.dir === dir)
        .flatMap(({ base, usecase }) =>
          composed(base, usecase)
            .filter((step) => (step.origin === "base" ? base.dir : usecase.dir) === dir)
            .map((step) => step.skill),
        ),
    );
    const skills = join(PACKS_DIR, dir, "skills");
    const shipped = existsSync(skills) ? readdirSync(skills).map((name) => `skills/${name}`) : [];
    expect(shipped.filter((skill) => !used.has(skill))).toEqual([]);
  });
});

// A next step is a button on a finished build: one naming a usecase that is not shipped, that cannot sit on the same
// base, or whose answers its interview would refuse, is a button that opens a form that does not work.
const nextCases = usecases.flatMap(({ dir, manifest }) =>
  manifest.kind === "usecase" ? manifest.next.map((step) => [`${dir} -> ${step.usecase}`, manifest, step] as const) : [],
);

describe.each(nextCases)("next step %s", (_label, from, step) => {
  it("names a shipped usecase that sits on every base the finished one does", () => {
    const target = usecases.find((usecase) => usecase.dir === step.usecase)?.manifest;
    expect(target?.kind).toBe("usecase");
    from.bases.forEach((base) => expect(target?.kind === "usecase" && target.bases).toContain(base));
  });

  it("fills in only answers its interview would accept", () => {
    expect(answerProblems(hearingSchema.parse(readJson(step.usecase, "hearing.json")), step.answers)).toEqual([]);
  });
});

// A question that asks for one item per line must get a multi-line field: a single-line input cannot take a
// newline, and a browser drops the ones an example fills in.
const listQuestions = usecases.flatMap(({ dir }) =>
  hearingSchema
    .parse(readJson(dir, "hearing.json"))
    .questions.filter((question) => /1 行に 1 つ|one per line/iu.test(question.label))
    .map((question) => [`${dir}.${question.id}`, question] as const),
);

describe.each(listQuestions)("%s asks for one per line", (_label, question) => {
  it("says so, so the form gives it a multi-line field", () => {
    expect(question.lines).toBe(true);
  });
});

// A list of files in the folder is offered to pick from, so a person need not type the paths.
const fileListQuestions = listQuestions.filter(([, question]) => /このフォルダの中|files in the folder/iu.test(question.label));

describe.each(fileListQuestions)("%s asks for files in the folder", (_label, question) => {
  it("offers them to pick from", () => {
    expect(question.pick).toBe("files");
  });
});

describe("check scripts", () => {
  const scripts = packDirs.flatMap((dir) => {
    const checks = join(PACKS_DIR, dir, "checks");
    return existsSync(checks) ? readdirSync(checks).map((file) => join(checks, file)) : [];
  });

  it.skipIf(process.platform === "win32").each(scripts.filter((script) => script.endsWith(".sh")))("%s parses as sh", (script) => {
    expect(() => execFileSync("/bin/sh", ["-n", script])).not.toThrow();
  });

  it.each(scripts.filter((script) => script.endsWith(".mjs")))("%s parses as JavaScript", (script) => {
    expect(() => execFileSync(process.execPath, ["--check", script])).not.toThrow();
  });

  // A .d.mts types a pure module for the specs (typecheck reads it); it is allowed only beside that module.
  const isTypesOfModule = (script: string): boolean => script.endsWith(".d.mts") && scripts.includes(script.replace(/\.d\.mts$/, ".mjs"));

  it("holds only shell scripts and JavaScript modules", () => {
    expect(scripts.filter((script) => !/\.(sh|mjs)$/.test(script) && !isTypesOfModule(script))).toEqual([]);
  });
});

describe("templates", () => {
  const manifestOf = (dir: string): BaseManifest | UsecaseManifest | undefined => manifests.find((entry) => entry.dir === dir)?.manifest;

  it.each(packDirs)("%s: every JSON file parses", (dir) => {
    expect(manifestOf(dir)).toBeDefined();
    const infra = join(PACKS_DIR, dir, "infra");
    const jsonFiles = existsSync(infra) ? readdirSync(infra).filter((file) => file.endsWith(".json")) : [];
    jsonFiles.forEach((file) => expect(() => readJson(dir, join("infra", file))).not.toThrow());
  });

  it.each(packDirs.filter((dir) => existsSync(join(PACKS_DIR, dir, "infra", "firestore.rules"))))("%s: firestore.rules ends by denying everything", (dir) => {
    const rules = readFileSync(join(PACKS_DIR, dir, "infra", "firestore.rules"), "utf8");
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/);
    expect(rules).not.toMatch(/if\s+true\b/);
  });
});

describe("the packs ship with the package", () => {
  // The server reads the built-in packs from <package>/blueprints. Without it in `files`, an install from npm has none.
  it("lists blueprints/ in package.json files", () => {
    const pkg: unknown = JSON.parse(readFileSync(join(PACKS_DIR, "..", "package.json"), "utf8"));
    const files = typeof pkg === "object" && pkg !== null && "files" in pkg && Array.isArray(pkg.files) ? pkg.files : [];
    expect(files).toContain("blueprints/");
  });
});
