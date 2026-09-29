// The sample documents an example ships in its usecase pack (presets/<preset-id>/), and placing them in a
// project folder without ever overwriting a file the person already has.
import path from "node:path";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { writeAllOrNone } from "./writeAllOrNone.js";
import { SAMPLE_NAME_RE, samplePlan, type Sample } from "../../common/blueprint/samples.js";

/** The preset's samples, by name; none when the preset ships no folder. Anything but a plain named file is ignored. */
export async function readSamples(packDir: string, presetId: string): Promise<Sample[]> {
  const dir = path.join(packDir, "presets", presetId);
  // A pack may come from the market: a folder that is a link, or that sits under one, could point anywhere, so
  // it brings nothing unless it really is inside the pack.
  const folder = await lstat(dir).catch(() => null);
  if (folder === null || !folder.isDirectory()) return [];
  const [realDir, realPack] = await Promise.all([realpath(dir), realpath(packDir)]);
  if (!realDir.startsWith(realPack + path.sep)) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries.filter((entry) => entry.isFile() && SAMPLE_NAME_RE.test(entry.name)).map((entry) => entry.name);
  const ordered = files.toSorted((a, b) => a.localeCompare(b));
  return Promise.all(ordered.map(async (name) => ({ name, content: await readFile(path.join(dir, name), "utf8") })));
}

/**
 * What the folder holds under a sample's name: its text, a marker for anything that is not a plain file (a folder,
 * a link, even a broken one), or undefined when nothing is there.
 */
async function existingAt(file: string): Promise<string | undefined> {
  const found = await lstat(file).catch(() => null);
  if (found === null) return undefined;
  return found.isFile() ? readFile(file, "utf8") : "\u0000not a file";
}

/**
 * Places the samples in `projectDir`: copies the missing ones, leaves identical ones alone. With any clash it
 * writes nothing and returns the clashing names.
 */
export async function placeSamples(projectDir: string, samples: readonly Sample[]): Promise<{ readonly clashes: readonly string[] }> {
  const found = await Promise.all(
    samples.map(async (sample): Promise<[string, string | undefined]> => [sample.name, await existingAt(path.join(projectDir, sample.name))]),
  );
  const existing: Record<string, string | undefined> = Object.fromEntries(found);
  const plan = samplePlan(samples, existing);
  if (plan.clashes.length > 0) return { clashes: plan.clashes };
  // A file that appeared since the plan is not overwritten; the write fails instead, and nothing is left half-copied.
  await writeAllOrNone(plan.copy.map((sample) => ({ target: path.join(projectDir, sample.name), content: sample.content })));
  return { clashes: [] };
}
