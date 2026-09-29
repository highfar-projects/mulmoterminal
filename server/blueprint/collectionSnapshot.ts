// The collections a build may start from, and the copy of one — with every collection it links to — placed in the
// build's `.blueprint/source/`. The copy is read from the skill folders and written once; the source is never touched.
import path from "node:path";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { writeAllOrNone } from "./writeAllOrNone.js";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import type { CollectionItem } from "@mulmoclaude/core/collection";
import {
  MAX_SOURCE_BYTES,
  RECORDS_FILE,
  SOURCE_DIR,
  SOURCE_FILES_DIR,
  collectionClosure,
  declaredSkillFiles,
  foldersAbove,
  recordsJsonl,
  referencedFiles,
  sourcePath,
  sourceRecord,
} from "../../common/blueprint/collectionSource.js";

export type SourceCollection = { slug: string; title: string };
export type SnapshotFile = { path: string; content: string | Buffer };
export type Snapshot = { kind: "unknown" } | { kind: "too-large"; bytes: number } | { kind: "ok"; files: SnapshotFile[] };

/** Where builds find collections: every collection the workspace discovers. */
export interface CollectionSource {
  list: () => Promise<SourceCollection[]>;
  /** The files to place for a build starting from `slug`, with its records when `records` is asked for. */
  snapshot: (slug: string, nowMs: number, records: boolean) => Promise<Snapshot>;
}

/** How a collection's records and the workspace files they point at are read: the live store in the server, fixtures in specs. */
export interface RecordReader {
  records: (collection: LoadedCollection) => Promise<CollectionItem[]>;
  workspaceRoot: string;
}

// A shared app's collection lives in Firestore, and copying it is a later stage: it is neither offered nor followed.
const startable = (collection: LoadedCollection): boolean => collection.appId === undefined;

/** A file under `root`, or null when it is missing or resolves outside it (a link out of it). */
async function readWithin(root: string, file: string): Promise<Buffer | null> {
  const [realRoot, realFile] = await Promise.all([realpath(root).catch(() => ""), realpath(path.join(root, file)).catch(() => "")]);
  if (realRoot === "" || realFile === "" || !realFile.startsWith(realRoot + path.sep)) return null;
  return readFile(realFile).catch(() => null);
}

const present = <T>(entries: readonly (T | null)[]): T[] => entries.flatMap((entry) => (entry === null ? [] : [entry]));

async function skillFilesOf(collection: LoadedCollection): Promise<SnapshotFile[]> {
  const names = ["schema.json", "SKILL.md", ...declaredSkillFiles(collection.schema)];
  const files = await Promise.all(
    names.map(async (name) => {
      const content = await readWithin(collection.skillDir, name);
      return content === null ? null : { path: sourcePath(collection.slug, name), content: content.toString("utf8") };
    }),
  );
  return present(files);
}

async function recordFilesOf(collection: LoadedCollection, reader: RecordReader): Promise<SnapshotFile[]> {
  const items = await reader.records(collection);
  const pointedAt = await Promise.all(
    referencedFiles(collection.schema, items).map(async (file) => {
      const content = await readWithin(reader.workspaceRoot, file);
      return content === null ? null : { path: `${SOURCE_FILES_DIR}/${file}`, content };
    }),
  );
  return [{ path: sourcePath(collection.slug, RECORDS_FILE), content: recordsJsonl(items) }, ...present(pointedAt)];
}

const bytesOf = (files: readonly SnapshotFile[]): number => files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);

// Two collections may point at the same file; it is copied once.
const onceEach = (files: readonly SnapshotFile[]): SnapshotFile[] => [...new Map(files.map((file) => [file.path, file])).values()];

/** Builds the source over whatever discovers the collections and reads their records: the workspace in the server, fixtures in specs. */
export function collectionSource(discover: () => Promise<LoadedCollection[]>, reader: RecordReader, maxBytes: number = MAX_SOURCE_BYTES): CollectionSource {
  const known = async (): Promise<Map<string, LoadedCollection>> =>
    new Map((await discover()).filter(startable).map((collection) => [collection.slug, collection]));
  return {
    async list() {
      return [...(await known()).values()].map((collection) => ({ slug: collection.slug, title: collection.schema.title }));
    },
    async snapshot(slug, nowMs, records) {
      const collections = await known();
      if (!collections.has(slug)) return { kind: "unknown" };
      const closure = collectionClosure(slug, (linked) => collections.get(linked)?.schema ?? null);
      const linked = closure.slugs.flatMap((linkedSlug) => collections.get(linkedSlug) ?? []);
      const [skills, data] = await Promise.all([
        Promise.all(linked.map(skillFilesOf)),
        records ? Promise.all(linked.map((collection) => recordFilesOf(collection, reader))) : Promise.resolve([]),
      ]);
      const record = { path: `${SOURCE_DIR}/source.json`, content: `${JSON.stringify(sourceRecord(slug, closure, records, nowMs), null, 2)}\n` };
      const files = onceEach([record, ...skills.flat(), ...data.flat()]);
      const bytes = bytesOf(files);
      return bytes > maxBytes ? { kind: "too-large", bytes } : { kind: "ok", files };
    },
  };
}

// A folder on the way that is a link (or a file) would carry the copy out of the build's folder, or fail it halfway.
const notAFolder = (dir: string): Promise<boolean> =>
  lstat(dir).then(
    (found) => !found.isDirectory(),
    () => false,
  );

const exists = (file: string): Promise<boolean> =>
  lstat(file).then(
    () => true,
    () => false,
  );

/**
 * Writes the copy into `projectDir`. Anything already at one of its paths means an earlier copy is there, and a folder on
 * the way that is a link or a file could carry the copy elsewhere: either way nothing is written and those paths come back. A write that fails removes the files this call wrote, and rethrows.
 */
export async function placeSnapshot(projectDir: string, files: readonly SnapshotFile[]): Promise<{ readonly clashes: readonly string[] }> {
  const folders = foldersAbove(files.map((file) => file.path));
  const [present, blocked] = await Promise.all([
    Promise.all(files.map((file) => exists(path.join(projectDir, file.path)))),
    Promise.all(folders.map((folder) => notAFolder(path.join(projectDir, folder)))),
  ]);
  const clashes = [...folders.filter((_folder, index) => blocked[index]), ...files.filter((_file, index) => present[index]).map((file) => file.path)];
  if (clashes.length > 0) return { clashes };
  const writes = files.map((file) => ({ target: path.join(projectDir, file.path), content: file.content }));
  await Promise.all([...new Set(writes.map((write) => path.dirname(write.target)))].map((dir) => mkdir(dir, { recursive: true })));
  await writeAllOrNone(writes);
  return { clashes: [] };
}
