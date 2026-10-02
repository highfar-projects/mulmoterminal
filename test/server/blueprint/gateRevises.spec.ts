// @vitest-environment node
// What the conversation at a document gate may change. A gate's reads are often views a check wrote from a record
// (polish.txt from polish.json); the conversation must change the record, which is what the next step reads, and the
// check of the step before the gate is run again to rewrite the view and hold the record to it.
import { describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { basePlanSchema, composePlan, usecaseStepsSchema } from "../../../common/blueprint/plan";
import { declaredRevises, packProblems } from "../../../server/blueprint/packs";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const docsPlan = basePlanSchema.parse(readJson(path.join(PACKS, "docs", "plan.json")));
const checksText = (pack: string): string =>
  ["docs", pack]
    .flatMap((dir) => {
      const checks = path.join(PACKS, dir, "checks");
      return existsSync(checks) ? readdirSync(checks).map((file) => readFileSync(path.join(checks, file), "utf8")) : [];
    })
    .join("\n");

const gates = readdirSync(PACKS)
  .filter((pack) => existsSync(path.join(PACKS, pack, "steps.json")))
  .flatMap((pack) => {
    const usecase = usecaseStepsSchema.parse(readJson(path.join(PACKS, pack, "steps.json")));
    return usecase.steps.filter((step) => step.reads.length > 0).map((step) => ({ pack, usecase, step }));
  });
const basename = (file: string): string => path.basename(file).replace(/\.[^.]+$/u, "");

describe("a document gate's revisable files", () => {
  it("are declared at every gate that names files to read", () => {
    expect(gates.length).toBeGreaterThan(0);
    expect(gates.filter(({ step }) => step.revises.length === 0).map(({ pack, step }) => `${pack}/${step.id}`)).toEqual([]);
  });

  it.each(gates.map((gate) => [`${gate.pack}/${gate.step.id}`, gate] as const))(
    "%s: each read is revisable itself or through its record",
    (_name, { step }) => {
      step.reads.forEach((read) => {
        expect(step.revises.includes(read) || step.revises.some((file) => file.endsWith(".json") && basename(file) === basename(read)), read).toBe(true);
      });
    },
  );

  it.each(gates.map((gate) => [`${gate.pack}/${gate.step.id}`, gate] as const))(
    "%s: each revisable record is one the pack's checks use",
    (_name, { pack, step }) => {
      const text = checksText(pack);
      step.revises.filter((file) => file.startsWith(".blueprint/")).forEach((file) => expect(text, file).toContain(file));
    },
  );

  it.each(gates.map((gate) => [`${gate.pack}/${gate.step.id}`, gate] as const))(
    "%s: has a step before it whose check is run again",
    (_name, { usecase, step }) => {
      const composed = composePlan(docsPlan, usecase, "docs");
      if (!composed.ok) throw new Error(composed.problems.join("; "));
      expect(composed.steps.findIndex((entry) => entry.id === step.id)).toBeGreaterThan(0);
    },
  );

  it("are read back from the pack by step, and none for a step or pack that is not there", async () => {
    expect(await declaredRevises(path.join(PACKS, "write"), "draft")).toEqual([".blueprint/outline.json"]);
    expect(await declaredRevises(path.join(PACKS, "style"), "counter")).toEqual(["STYLE.md", "chaff.yaml"]);
    expect(await declaredRevises(path.join(PACKS, "write"), "no-such-step")).toEqual([]);
    expect(await declaredRevises(path.join(PACKS, "no-such-pack"), "draft")).toEqual([]);
  });

  it("are required of an installed pack whose gate names files to read", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "bp-revises-"));
    cpSync(path.join(PACKS, "polish"), path.join(root, "polish"), { recursive: true });
    const file = path.join(root, "polish", "steps.json");
    const steps = usecaseStepsSchema.parse(readJson(file));
    writeFileSync(file, JSON.stringify({ steps: steps.steps.map(({ revises: _revises, ...step }) => step) }));
    expect(await packProblems(path.join(root, "polish"))).toContain('step "polish" names files to read but no files its review may change (revises)');
    expect(await packProblems(path.join(PACKS, "polish"))).toEqual([]);
  });
});
