// @vitest-environment node
// The shipped packs in English: every document pack has an overlay, each overlay covers its pack exactly, and the form's
// routes lay it over the words while every value the checks compare stays as the pack wrote it.
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { overlayProblems, packLocaleSchema } from "../../../common/blueprint/packLocale";
import { blueprintManifestSchema } from "../../../common/blueprint/manifest";
import { hearingSchema } from "../../../common/blueprint/hearing";
import { localizedPacks, localizedPair, localizedPresets } from "../../../server/blueprint/packLocales";
import { packProblems, type PackRoot } from "../../../server/blueprint/packs";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const ROOTS: PackRoot[] = [{ dir: PACKS, source: "builtin" }];
const DOCUMENT_PACKS = ["docs", "adopt", "ask", "compare", "glossary", "polish", "review", "style", "summarize", "verify", "write"];

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
const idsOf = (file: string, key: string): string[] => {
  const parsed = existsSync(file) ? readJson(file) : null;
  const list = typeof parsed === "object" && parsed !== null && key in parsed ? (parsed as Record<string, unknown>)[key] : [];
  return [
    ...new Set((Array.isArray(list) ? list : []).flatMap((entry) => (typeof entry === "object" && entry !== null && "id" in entry ? [String(entry.id)] : []))),
  ];
};
const packsWithOverlay = readdirSync(PACKS).filter((slug) => existsSync(path.join(PACKS, slug, "locales", "en.json")));

describe("the shipped packs' English overlays", () => {
  it("cover every document pack", () => {
    expect(DOCUMENT_PACKS.filter((slug) => !packsWithOverlay.includes(slug))).toEqual([]);
  });

  it.each(packsWithOverlay)("%s covers its pack exactly", (slug) => {
    const dir = path.join(PACKS, slug);
    const manifest = blueprintManifestSchema.parse(readJson(path.join(dir, "manifest.json")));
    const overlay = packLocaleSchema.parse(readJson(path.join(dir, "locales", "en.json")));
    const hearingFile = path.join(dir, "hearing.json");
    const problems = overlayProblems(overlay, {
      manifest,
      hearing: existsSync(hearingFile) ? hearingSchema.parse(readJson(hearingFile)) : null,
      stepIds: manifest.kind === "base" ? idsOf(path.join(dir, "plan.json"), "steps") : idsOf(path.join(dir, "steps.json"), "steps"),
      presetIds: idsOf(path.join(dir, "presets.json"), "presets"),
    });
    expect(problems).toEqual([]);
  });
});

describe("the form's routes in English", () => {
  it("show polish's questions, options and steps in English, and keep the values the checks compare", async () => {
    const pair = await localizedPair(ROOTS, "docs", "polish", "en");
    if (!pair.ok) throw new Error(pair.problems.join("; "));
    const style = pair.hearing.questions.find((question) => question.id === "style");
    expect(style?.label).toBe("Which style should they follow?");
    expect(style?.options).toEqual(["このフォルダの規約（STYLE.md と chaff.yaml）", "chaff の既定のまま"]);
    expect(style?.optionLabels?.["chaff の既定のまま"]).toBe("chaff's defaults");
    expect(pair.steps.find((step) => step.id === "polish")?.title).toBe("Polish them one by one");
  });

  it("show the packs as written to a Japanese screen", async () => {
    const pair = await localizedPair(ROOTS, "docs", "polish", "ja");
    if (!pair.ok) throw new Error(pair.problems.join("; "));
    expect(pair.hearing.questions.find((question) => question.id === "style")?.label).toBe("どの規約に合わせますか");
    expect(pair.hearing.questions.every((question) => question.optionLabels === undefined)).toBe(true);
  });

  it("name the packs and examples in English", async () => {
    const packs = await localizedPacks(ROOTS, "en");
    expect(packs.find((pack) => pack.slug === "polish")?.manifest.title).toBe("Polish documents (without changing what they say)");
    const presets = await localizedPresets(ROOTS, "en");
    expect(presets.find((preset) => preset.usecase === "polish" && preset.id === "blog")?.title).toBe("Polish a blog post as a blog post");
  });

  it("refuse an installed pack whose overlay leaves something out, and pass every shipped pack", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "bp-locale-"));
    cpSync(path.join(PACKS, "polish"), path.join(root, "polish"), { recursive: true });
    const overlayFile = path.join(root, "polish", "locales", "en.json");
    const overlay = packLocaleSchema.parse(readJson(overlayFile));
    writeFileSync(overlayFile, JSON.stringify({ ...overlay, steps: { ...overlay.steps, gone: { title: "Gone" } }, presets: {} }));
    const problems = await packProblems(path.join(root, "polish"));
    expect(problems).toContain('locales/en.json: words for step "gone", which the pack does not have');
    expect(problems).toContain('locales/en.json: no words for example "blog"');
    const shipped = await Promise.all(packsWithOverlay.map(async (slug) => [slug, await packProblems(path.join(PACKS, slug))]));
    expect(shipped.filter(([, found]) => found.length > 0)).toEqual([]);
  });

  it("show a pack whose overlay is broken as written, rather than hiding the packs", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "bp-locale-"));
    cpSync(path.join(PACKS, "polish"), path.join(root, "polish"), { recursive: true });
    mkdirSync(path.join(root, "polish", "locales"), { recursive: true });
    writeFileSync(path.join(root, "polish", "locales", "en.json"), "{ not json");
    const packs = await localizedPacks([{ dir: root, source: "installed" }], "en");
    expect(packs.find((pack) => pack.slug === "polish")?.manifest.title).toBe("文書を整える（書いてあることは変えずに）");
  });
});
