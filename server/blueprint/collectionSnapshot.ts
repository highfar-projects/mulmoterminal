// The collections a build may start from, and the copy of one — with every collection it links to — placed in the
// build's `.blueprint/source/`. The copy is read from the skill folders and written once; the source is never touched.
import path from "node:path";
import { lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import { SOURCE_DIR, collectionClosure, declaredSkillFiles, sourcePath, sourceRecord } from "../../common/blueprint/collectionSource.js";

export type SourceCollection = { slug: string; title: string };
export type SnapshotFile = { path: string; content: string };

/** Where builds find collections: every collection the workspace discovers. */
export interface CollectionSource {
  list: () => Promise<SourceCollection[]>;
  /** The files to place for a build starting from `slug`; null when no such collection can be started from. */
  snapshot: (slug: string, nowMs: number) => Promise<SnapshotFile[] | null>;
}

// A shared app's collection lives in Firestore, and copying it is a later stage: it is neither offered nor followed.
const startable = (collection: LoadedCollection): boolean => collection.appId === undefined;

/** A file in the skill folder, or null when it is missing or resolves outside the folder (a link out of it). */
async function readInSkill(skillDir: string, file: string): Promise<string | null> {
  const [realDir, realFile] = await Promise.all([realpath(skillDir).catch(() => ""), realpath(path.join(skillDir, file)).catch(() => "")]);
  if (realDir === "" || realFile === "" || !realFile.startsWith(realDir + path.sep)) return null;
  return readFile(realFile, "utf8").catch(() => null);
}

async function filesOf(collection: LoadedCollection): Promise<SnapshotFile[]> {
  const names = ["schema.json", "SKILL.md", ...declaredSkillFiles(collection.schema)];
  const contents = await Promise.all(names.map((name) => readInSkill(collection.skillDir, name)));
  return names.flatMap((name, index) => {
    const content = contents[index];
    return content === null || content === undefined ? [] : [{ path: sourcePath(collection.slug, name), content }];
  });
}

/** Builds the source over whatever discovers the collections: the workspace in the server, a fixture in specs. */
export function collectionSource(discover: () => Promise<LoadedCollection[]>): CollectionSource {
  const known = async (): Promise<Map<string, LoadedCollection>> =>
    new Map((await discover()).filter(startable).map((collection) => [collection.slug, collection]));
  return {
    async list() {
      return [...(await known()).values()].map((collection) => ({ slug: collection.slug, title: collection.schema.title }));
    },
    async snapshot(slug, nowMs) {
      const collections = await known();
      if (!collections.has(slug)) return null;
      const closure = collectionClosure(slug, (linked) => collections.get(linked)?.schema ?? null);
      const linked = closure.slugs.flatMap((linkedSlug) => collections.get(linkedSlug) ?? []);
      const files = await Promise.all(linked.map(filesOf));
      const record = { path: `${SOURCE_DIR}/source.json`, content: `${JSON.stringify(sourceRecord(slug, closure, nowMs), null, 2)}\n` };
      return [record, ...files.flat()];
    },
  };
}

const exists = (file: string): Promise<boolean> =>
  lstat(file).then(
    () => true,
    () => false,
  );

/**
 * Writes the copy into `projectDir`. Anything already at one of its paths means an earlier copy is there: nothing is
 * written and the clashing paths come back. A write that fails removes what this call wrote, and rethrows.
 */
export async function placeSnapshot(projectDir: string, files: readonly SnapshotFile[]): Promise<{ readonly clashes: readonly string[] }> {
  const present = await Promise.all(files.map((file) => exists(path.join(projectDir, file.path))));
  const clashes = files.filter((_file, index) => present[index]).map((file) => file.path);
  if (clashes.length > 0) return { clashes };
  const targets = files.map((file) => path.join(projectDir, file.path));
  const results = await Promise.allSettled(
    files.map(async (file, index) => {
      const target = targets[index] ?? "";
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, { flag: "wx" });
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) {
    await Promise.all(targets.filter((_target, index) => results[index]?.status === "fulfilled").map((target) => rm(target, { force: true })));
    throw failed.reason;
  }
  return { clashes: [] };
}
