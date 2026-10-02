// The packs as a person reads them in their screen's language: each pack's `locales/<language>.json` laid over what the
// new-build form shows. A pack without one, or a screen in Japanese, shows the pack as written.
import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  localizedHearing,
  localizedManifest,
  localizedPreset,
  localizedSteps,
  overlayLanguage,
  packLocaleSchema,
  type PackLocale,
} from "../../common/blueprint/packLocale.js";
import type { PresetListing } from "../../common/blueprint/presets.js";
import { listPacks, listPresets, loadPackPair, packDirOf, type PackPair, type PackRoot, type PackSummary } from "./packs.js";

/** A pack's overlay for the screen language, or null — none written, or the screen reads the pack as written. */
export async function readPackLocale(packDir: string | null, screenLanguage: string | undefined): Promise<PackLocale | null> {
  const language = overlayLanguage(screenLanguage);
  if (packDir === null || language === null) return null;
  const raw = await readFile(path.join(packDir, "locales", `${language}.json`), "utf8").catch(() => null);
  if (raw === null) return null;
  // A broken overlay shows the pack as written rather than hiding every pack from the form; packProblems names it.
  try {
    return packLocaleSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const overlayOf = async (roots: readonly PackRoot[], slug: string, screenLanguage: string | undefined): Promise<PackLocale | null> =>
  readPackLocale(await packDirOf(roots, slug), screenLanguage);

export async function localizedPacks(roots: readonly PackRoot[], screenLanguage: string | undefined): Promise<PackSummary[]> {
  const packs = await listPacks(roots);
  return Promise.all(packs.map(async (pack) => ({ ...pack, manifest: localizedManifest(pack.manifest, await overlayOf(roots, pack.slug, screenLanguage)) })));
}

export async function localizedPresets(roots: readonly PackRoot[], screenLanguage: string | undefined): Promise<PresetListing[]> {
  const presets = await listPresets(roots);
  return Promise.all(presets.map(async (preset) => localizedPreset(preset, await overlayOf(roots, preset.usecase, screenLanguage))));
}

/** The pair for the form: its questions in the usecase's words, each step in the words of the pack that wrote it. */
export async function localizedPair(roots: readonly PackRoot[], baseSlug: string, usecaseSlug: string, screenLanguage: string | undefined): Promise<PackPair> {
  const pair = await loadPackPair(roots, baseSlug, usecaseSlug);
  if (!pair.ok) return pair;
  const [base, usecase] = await Promise.all([readPackLocale(pair.basePackDir, screenLanguage), readPackLocale(pair.usecasePackDir, screenLanguage)]);
  return { ...pair, hearing: localizedHearing(pair.hearing, usecase), steps: localizedSteps(pair.steps, { base, usecase }) };
}
