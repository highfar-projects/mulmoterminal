// The collections a build may start from, and the copy of one — with every collection it links to — placed in the
// build's `.blueprint/source/`. The copy is read from the skill folders and written once; the source is never touched.
import path from "node:path";
import { lstat, mkdir, readFile, realpath } from "node:fs/promises";
import { writeAllOrNone } from "./writeAllOrNone.js";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import type { CollectionItem } from "@mulmoclaude/core/collection";
import { appIdOf, appSourceValue, collectionsNotFullyReadable } from "../../common/blueprint/sharedAppSource.js";
import { personalDataOf, type PersonalData } from "../../common/blueprint/personalData.js";
import { SOURCE_RECORD_PATH, sourceFingerprint } from "./sourceFingerprint.js";
import {
  APP_MANIFEST_COPY,
  MAX_SOURCE_BYTES,
  RECORDS_FILE,
  SOURCE_FILES_DIR,
  collectionClosure,
  declaredSkillFiles,
  foldersAbove,
  recordsJsonl,
  referencedFiles,
  sourcePath,
  sourceRecord,
} from "../../common/blueprint/collectionSource.js";

export type SourceCollection = { slug: string; title: string; kind: "collection" | "app" };
export type SnapshotFile = { path: string; content: string | Buffer };
export type Snapshot =
  | { kind: "unknown" }
  | { kind: "too-large"; bytes: number }
  | { kind: "signed-out" }
  | { kind: "not-a-reader"; collections: string[] }
  | { kind: "ok"; files: SnapshotFile[]; personal: PersonalData; fingerprint: string };

/** Where builds find their source: every collection the workspace discovers, and every shared app in a known folder. */
export interface CollectionSource {
  list: () => Promise<SourceCollection[]>;
  /** The files to place for a build starting from `slug` (a collection, or `app:<id>`), with its records when asked for. */
  snapshot: (slug: string, nowMs: number, records: boolean) => Promise<Snapshot>;
}

/** How records and the files they point at are read, from the folder a collection belongs to: the live store in the server, fixtures in specs. */
export interface RecordReader {
  records: (collection: LoadedCollection, root: string) => Promise<CollectionItem[]>;
}

/** A shared app, opened: the folder it lives in, its declaration as written, and its shared collections. */
export type OpenedApp = { root: string; manifest: string; title: string; collections: LoadedCollection[] };

/** The shared apps a build may start from, and who is signed in to read their records. */
export interface SharedApps {
  list: () => Promise<{ id: string; title: string }[]>;
  open: (id: string) => Promise<OpenedApp | null>;
  signedInEmail: () => string | null;
}

export type SourceOptions = {
  discover: () => Promise<LoadedCollection[]>;
  /** The folder the discovered collections belong to: where the files their records point at are read from. */
  workspaceRoot: string;
  reader: RecordReader;
  apps: SharedApps;
  maxBytes?: number;
};

// A shared app's collection lives in Firestore and is copied with its whole app, never on its own.
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

async function recordFilesOf(collection: LoadedCollection, reader: RecordReader, root: string): Promise<SnapshotFile[]> {
  const items = await reader.records(collection, root);
  const pointedAt = await Promise.all(
    referencedFiles(collection.schema, items).map(async (file) => {
      const content = await readWithin(root, file);
      return content === null ? null : { path: `${SOURCE_FILES_DIR}/${file}`, content };
    }),
  );
  return [{ path: sourcePath(collection.slug, RECORDS_FILE), content: recordsJsonl(items) }, ...present(pointedAt)];
}

const bytesOf = (files: readonly SnapshotFile[]): number => files.reduce((total, file) => total + Buffer.byteLength(file.content), 0);

// Two collections may point at the same file; it is copied once.
const onceEach = (files: readonly SnapshotFile[]): SnapshotFile[] => [...new Map(files.map((file) => [file.path, file])).values()];

// `manifest`: a shared app's declaration, parsed; null for a collection.
type Taken = {
  from: "collection" | "app";
  start: string;
  /** The answer that named the source: a collection's slug, or `app:<id>`. */
  source: string;
  collections: LoadedCollection[];
  missing: string[];
  root: string;
  extra: SnapshotFile[];
  manifest: unknown;
};

/** The copy of what was taken, with its records when asked for, or why it is too heavy to take. */
async function copyOf(taken: Taken, options: SourceOptions, records: boolean, nowMs: number): Promise<Snapshot> {
  const [skills, data] = await Promise.all([
    Promise.all(taken.collections.map(skillFilesOf)),
    records ? Promise.all(taken.collections.map((collection) => recordFilesOf(collection, options.reader, taken.root))) : Promise.resolve([]),
  ]);
  const closure = { slugs: taken.collections.map((collection) => collection.slug), missing: taken.missing };
  const copied = onceEach([...taken.extra, ...skills.flat(), ...data.flat()]);
  const fingerprint = sourceFingerprint(copied);
  const identity = { source: taken.source, fingerprint };
  const record = {
    path: SOURCE_RECORD_PATH,
    content: `${JSON.stringify(sourceRecord(taken.from, taken.start, closure, records, nowMs, identity), null, 2)}\n`,
  };
  const files = [record, ...copied];
  const bytes = bytesOf(files);
  if (bytes > (options.maxBytes ?? MAX_SOURCE_BYTES)) return { kind: "too-large", bytes };
  return { kind: "ok", files, personal: personalDataOf(taken.collections, records, taken.manifest), fingerprint };
}

async function collectionSnapshot(slug: string, options: SourceOptions, records: boolean, nowMs: number): Promise<Snapshot> {
  const collections = new Map((await options.discover()).filter(startable).map((collection) => [collection.slug, collection]));
  if (!collections.has(slug)) return { kind: "unknown" };
  const closure = collectionClosure(slug, (linked) => collections.get(linked)?.schema ?? null);
  const linked = closure.slugs.flatMap((linkedSlug) => collections.get(linkedSlug) ?? []);
  return copyOf(
    { from: "collection", start: slug, source: slug, collections: linked, missing: closure.missing, root: options.workspaceRoot, extra: [], manifest: null },
    options,
    records,
    nowMs,
  );
}

/**
 * A shared app, whole. Its records are read with the person's own session, so a copy with records needs one — and a
 * role that reads every record: under the rules anyone else reads a part, and the copy would be short without a word.
 */
async function appSnapshot(id: string, options: SourceOptions, records: boolean, nowMs: number): Promise<Snapshot> {
  const app = await options.apps.open(id);
  if (app === null) return { kind: "unknown" };
  if (records) {
    const email = options.apps.signedInEmail();
    if (email === null) return { kind: "signed-out" };
    const unreadable = collectionsNotFullyReadable(
      parsedManifest(app.manifest),
      email,
      app.collections.map((collection) => collection.slug),
    );
    if (unreadable.length > 0) return { kind: "not-a-reader", collections: unreadable };
  }
  const extra = [{ path: APP_MANIFEST_COPY, content: app.manifest }];
  const taken: Taken = {
    from: "app",
    start: app.title,
    source: appSourceValue(id),
    collections: app.collections,
    missing: [],
    root: app.root,
    extra,
    manifest: parsedManifest(app.manifest),
  };
  return copyOf(taken, options, records, nowMs);
}

const parsedManifest = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Builds the source over whatever discovers collections and opens shared apps: the workspace in the server, fixtures in specs. */
export function collectionSource(options: SourceOptions): CollectionSource {
  return {
    async list() {
      const [collections, apps] = await Promise.all([options.discover(), options.apps.list()]);
      const fromCollections = collections
        .filter(startable)
        .map((collection): SourceCollection => ({ slug: collection.slug, title: collection.schema.title, kind: "collection" }));
      const fromApps = apps.map((app): SourceCollection => ({ slug: appSourceValue(app.id), title: app.title, kind: "app" }));
      return [...fromCollections, ...fromApps];
    },
    async snapshot(slug, nowMs, records) {
      const appId = appIdOf(slug);
      return appId === null ? collectionSnapshot(slug, options, records, nowMs) : appSnapshot(appId, options, records, nowMs);
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
