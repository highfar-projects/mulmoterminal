// @vitest-environment node
// The copy of a collection a build starts from: read from the skill folders (never through a link out of one), and
// written into the build's folder once — never over an earlier copy, and never half.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CollectionSchemaZ } from "@mulmoclaude/core/collection/server";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import {
  collectionSource,
  placeSnapshot,
  type OpenedApp,
  type RecordReader,
  type SharedApps,
  type SnapshotFile,
} from "../../../server/blueprint/collectionSnapshot";
import type { CollectionItem } from "@mulmoclaude/core/collection";

const TAKEN_AT_MS = Date.UTC(2026, 8, 29);

let root = "";
// Records by collection slug; the workspace the files they point at are read from is the temp root.
let records: Record<string, CollectionItem[]> = {};
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bp-collection-"));
  records = {};
  apps = {};
  signedIn = null;
  readFrom.length = 0;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const field = (spec: object): object => ({ label: "x", ...spec });

async function collection(slug: string, fields: Record<string, object>, extra: object = {}, files: Record<string, string> = {}): Promise<LoadedCollection> {
  const raw = {
    title: `T ${slug}`,
    icon: "book",
    dataPath: `data/${slug}/items`,
    primaryKey: "id",
    fields: { id: field({ type: "string", primary: true }), ...fields },
    ...extra,
  };
  const skillDir = path.join(root, "skills", slug);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "schema.json"), JSON.stringify(raw));
  await writeFile(path.join(skillDir, "SKILL.md"), `# ${slug}\n`);
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await mkdir(path.dirname(path.join(skillDir, name)), { recursive: true });
      await writeFile(path.join(skillDir, name), content);
    }),
  );
  return { slug, source: "project", schema: CollectionSchemaZ.parse(raw), dataDir: path.join(root, "data", slug), skillDir };
}

// Records by collection slug, and the roots they were read from; the shared apps the source offers, and who is signed in.
const readFrom: string[] = [];
const reader: RecordReader = {
  records: async (collection, from) => {
    readFrom.push(from);
    return records[collection.slug] ?? [];
  },
};
let apps: Record<string, OpenedApp> = {};
let signedIn: string | null = null;
const sharedApps: SharedApps = {
  list: async () => Object.entries(apps).map(([id, app]) => ({ id, title: app.title })),
  open: async (id) => apps[id] ?? null,
  signedInEmail: () => signedIn,
};
const sourceOf = (collections: LoadedCollection[], maxBytes?: number) =>
  collectionSource({ discover: async () => collections, workspaceRoot: root, reader, apps: sharedApps, ...(maxBytes === undefined ? {} : { maxBytes }) });

async function filesOf(source: ReturnType<typeof sourceOf>, slug: string, withRecords = false): Promise<SnapshotFile[]> {
  const snapshot = await source.snapshot(slug, TAKEN_AT_MS, withRecords);
  if (snapshot.kind !== "ok") throw new Error(`expected a copy, got ${snapshot.kind}`);
  return snapshot.files;
}

const text = (file: SnapshotFile | undefined): string => (file === undefined ? "" : file.content.toString());

describe("collectionSource", () => {
  it("offers the collections by slug and title, leaving out a shared app's", async () => {
    const books = await collection("books", {});
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const source = sourceOf([books, shared]);
    expect(await source.list()).toEqual([{ slug: "books", title: "T books", kind: "collection" }]);
  });

  it("copies the start and what it links to, with their declared views and templates, and records it", async () => {
    const books = await collection(
      "books",
      { author: field({ type: "ref", to: "authors" }), gone: field({ type: "ref", to: "missing" }) },
      { views: [{ id: "board", label: "Board", file: "views/board.html" }] },
      { "views/board.html": "<p>board</p>", "views/undeclared.html": "<p>no</p>" },
    );
    const authors = await collection(
      "authors",
      {},
      { collectionActions: [{ id: "help", label: "Help", kind: "chat", role: "general", template: "templates/help.md" }] },
      {
        "templates/help.md": "help me",
      },
    );
    const unrelated = await collection("other", {});
    const files = await filesOf(sourceOf([books, authors, unrelated]), "books");
    expect(files.map((file) => file.path).toSorted()).toEqual([
      ".blueprint/source/collections/authors/SKILL.md",
      ".blueprint/source/collections/authors/schema.json",
      ".blueprint/source/collections/authors/templates/help.md",
      ".blueprint/source/collections/books/SKILL.md",
      ".blueprint/source/collections/books/schema.json",
      ".blueprint/source/collections/books/views/board.html",
      ".blueprint/source/source.json",
    ]);
    const record = JSON.parse(text(files.find((file) => file.path.endsWith("source.json"))));
    expect(record).toEqual({
      from: "collection",
      start: "books",
      source: "books",
      collections: ["books", "authors"],
      missing: ["missing"],
      records: false,
      takenAt: "2026-09-29T00:00:00.000Z",
      fingerprint: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
  });

  it("does not follow a link into a shared app's collection, and names it missing", async () => {
    const books = await collection("books", { votes: field({ type: "ref", to: "votes" }) });
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const files = await filesOf(sourceOf([books, shared]), "books");
    expect(JSON.parse(text(files[0])).missing).toEqual(["votes"]);
    expect(files.some((file) => file.path.includes("/votes/"))).toBe(false);
  });

  it("skips a declared file that is not there, and one that is a link out of the skill folder", async () => {
    const outside = path.join(root, "secret.html");
    await writeFile(outside, "secret");
    const books = await collection(
      "books",
      {},
      {
        views: [
          { id: "a", label: "A", file: "views/absent.html" },
          { id: "b", label: "B", file: "views/linked.html" },
        ],
      },
    );
    await mkdir(path.join(books.skillDir, "views"), { recursive: true });
    await symlink(outside, path.join(books.skillDir, "views", "linked.html"));
    const files = await filesOf(sourceOf([books]), "books");
    expect(files.map((file) => file.path).filter((file) => file.includes("/views/"))).toEqual([]);
    expect(files.some((file) => text(file) === "secret")).toBe(false);
  });

  it("has nothing to copy for a collection it does not know, or a shared app's", async () => {
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const source = sourceOf([shared]);
    expect(await source.snapshot("nope", TAKEN_AT_MS, false)).toEqual({ kind: "unknown" });
    expect(await source.snapshot("votes", TAKEN_AT_MS, true)).toEqual({ kind: "unknown" });
  });
});

describe("collectionSource with records", () => {
  it("copies each collection's records and the workspace files they point at, and says so in source.json", async () => {
    const books = await collection("books", { cover: field({ type: "image" }), author: field({ type: "ref", to: "authors" }) });
    const authors = await collection("authors", { name: field({ type: "string" }) });
    records = { books: [{ id: "b1", cover: "images/b1.png", author: "a1" }], authors: [{ id: "a1", name: "Ann" }] };
    await mkdir(path.join(root, "images"), { recursive: true });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await writeFile(path.join(root, "images", "b1.png"), png);
    const files = await filesOf(sourceOf([books, authors]), "books", true);
    const at = (file: string) => files.find((candidate) => candidate.path === file);
    expect(text(at(".blueprint/source/collections/books/records.jsonl"))).toBe('{"id":"b1","cover":"images/b1.png","author":"a1"}\n');
    expect(text(at(".blueprint/source/collections/authors/records.jsonl"))).toBe('{"id":"a1","name":"Ann"}\n');
    expect(Buffer.compare(Buffer.from(at(".blueprint/source/files/images/b1.png")?.content ?? ""), png)).toBe(0);
    expect(JSON.parse(text(at(".blueprint/source/source.json"))).records).toBe(true);
  });

  it("copies no records when they are not asked for", async () => {
    const books = await collection("books", {});
    records = { books: [{ id: "b1" }] };
    const files = await filesOf(sourceOf([books]), "books", false);
    expect(files.some((file) => file.path.endsWith("records.jsonl"))).toBe(false);
  });

  it("leaves out a pointed-at file that is missing, outside the workspace, or reached through a link out of it", async () => {
    const books = await collection("books", { cover: field({ type: "image" }) });
    const outside = await mkdtemp(path.join(os.tmpdir(), "bp-outside-"));
    try {
      await writeFile(path.join(outside, "secret.png"), "secret");
      await symlink(path.join(outside, "secret.png"), path.join(root, "linked.png"));
      records = {
        books: [
          { id: "1", cover: "absent.png" },
          { id: "2", cover: "linked.png" },
          { id: "3", cover: "../secret.png" },
        ],
      };
      const files = await filesOf(sourceOf([books]), "books", true);
      expect(files.filter((file) => file.path.startsWith(".blueprint/source/files/"))).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("copies a file two records point at once", async () => {
    const books = await collection("books", { cover: field({ type: "image" }) });
    await writeFile(path.join(root, "shared.png"), "png");
    records = {
      books: [
        { id: "1", cover: "shared.png" },
        { id: "2", cover: "shared.png" },
      ],
    };
    const files = await filesOf(sourceOf([books]), "books", true);
    expect(files.filter((file) => file.path === ".blueprint/source/files/shared.png")).toHaveLength(1);
  });

  it("names the record fields that may hold personal data, of the start and what it links to, only when the records come", async () => {
    const people = await collection("people", { email: field({ type: "email", label: "Email" }), fullName: field({ type: "string", label: "Full name" }) });
    const books = await collection("books", { title: field({ type: "string" }), lender: field({ type: "ref", to: "people" }) });
    const personalOf = async (withRecords: boolean) => {
      const snapshot = await sourceOf([books, people]).snapshot("books", TAKEN_AT_MS, withRecords);
      return snapshot.kind === "ok" ? snapshot.personal : null;
    };
    expect(await personalOf(true)).toEqual({
      fields: [
        { collection: "people", field: "email", label: "Email" },
        { collection: "people", field: "fullName", label: "Full name" },
      ],
      members: 0,
    });
    expect(await personalOf(false)).toEqual({ fields: [], members: 0 });
  });

  it("records what it copied from and its fingerprint in source.json, and the same copy taken again has the same one", async () => {
    const books = await collection("books", { title: field({ type: "string" }) });
    records = { books: [{ id: "1", title: "One" }] };
    const first = await sourceOf([books]).snapshot("books", TAKEN_AT_MS, true);
    const again = await sourceOf([books]).snapshot("books", TAKEN_AT_MS + 1, true);
    if (first.kind !== "ok" || again.kind !== "ok") throw new Error("expected copies");
    expect(JSON.parse(text(first.files.find((file) => file.path.endsWith("source.json"))))).toMatchObject({ source: "books", fingerprint: first.fingerprint });
    expect(again.fingerprint).toBe(first.fingerprint);
    records = { books: [{ id: "1", title: "One, edited" }] };
    const changed = await sourceOf([books]).snapshot("books", TAKEN_AT_MS, true);
    expect(changed.kind === "ok" && changed.fingerprint).not.toBe(first.fingerprint);
  });

  it("refuses a copy heavier than the limit, and names its weight; the shape alone still fits", async () => {
    const books = await collection("books", {});
    const LIMIT_BYTES = 1000;
    records = { books: [{ id: "b1", note: "x".repeat(2 * LIMIT_BYTES) }] };
    const snapshot = await sourceOf([books], LIMIT_BYTES).snapshot("books", TAKEN_AT_MS, true);
    expect(snapshot.kind === "too-large" && snapshot.bytes > LIMIT_BYTES).toBe(true);
    expect((await sourceOf([books], LIMIT_BYTES).snapshot("books", TAKEN_AT_MS, false)).kind).toBe("ok");
  });
});

describe("collectionSource with a shared app", () => {
  const MANIFEST = {
    aid: "aid-1",
    name: "Votes",
    members: { "Owner@Example.com": { "*": "owner" }, "p@example.com": { "*": "participant", ballots: "viewer" } },
  };

  async function openApp(): Promise<OpenedApp> {
    const ballots = { ...(await collection("ballots", { choice: field({ type: "string" }) })), appId: "aid-1" };
    const topics = { ...(await collection("topics", { title: field({ type: "string" }) })), appId: "aid-1" };
    const appRoot = path.join(root, "app-repo");
    await mkdir(appRoot, { recursive: true });
    return { root: appRoot, manifest: JSON.stringify(MANIFEST), title: "Votes", collections: [ballots, topics] };
  }

  it("offers the app after the collections, named by its folder's id", async () => {
    apps = { f00d: await openApp() };
    expect((await sourceOf([await collection("books", {})]).list()).map((choice) => [choice.slug, choice.kind])).toEqual([
      ["books", "collection"],
      ["app:f00d", "app"],
    ]);
  });

  it("copies the declaration and every collection of the app, and records it as an app", async () => {
    apps = { f00d: await openApp() };
    const files = await filesOf(sourceOf([]), "app:f00d", false);
    expect(
      files
        .map((file) => file.path)
        .filter((file) => file.endsWith("schema.json") || file.endsWith("app.json"))
        .toSorted(),
    ).toEqual([".blueprint/source/app.json", ".blueprint/source/collections/ballots/schema.json", ".blueprint/source/collections/topics/schema.json"]);
    expect(JSON.parse(text(files.find((file) => file.path.endsWith("source.json"))))).toMatchObject({
      from: "app",
      start: "Votes",
      source: "app:f00d",
      collections: ["ballots", "topics"],
      records: false,
    });
  });

  it("copies the shape without anyone signed in, counting the roster's addresses as personal data it carries", async () => {
    apps = { f00d: await openApp() };
    expect(await sourceOf([]).snapshot("app:f00d", TAKEN_AT_MS, false)).toMatchObject({ kind: "ok", personal: { fields: [], members: 2 } });
  });

  it("refuses the records to someone not signed in", async () => {
    apps = { f00d: await openApp() };
    expect(await sourceOf([]).snapshot("app:f00d", TAKEN_AT_MS, true)).toEqual({ kind: "signed-out" });
  });

  it("refuses the records where the person's role reads only part of them, and names those collections", async () => {
    apps = { f00d: await openApp() };
    signedIn = "p@example.com";
    expect(await sourceOf([]).snapshot("app:f00d", TAKEN_AT_MS, true)).toEqual({ kind: "not-a-reader", collections: ["topics"] });
  });

  it("copies the records for a full reader, read from the app's own folder", async () => {
    const app = await openApp();
    apps = { f00d: app };
    signedIn = "owner@example.com";
    records = { ballots: [{ id: "1", choice: "yes" }], topics: [{ id: "t", title: "Budget" }] };
    const files = await filesOf(sourceOf([]), "app:f00d", true);
    expect(
      files
        .filter((file) => file.path.endsWith("records.jsonl"))
        .map((file) => file.path)
        .toSorted(),
    ).toEqual([".blueprint/source/collections/ballots/records.jsonl", ".blueprint/source/collections/topics/records.jsonl"]);
    expect(readFrom).toEqual([app.root, app.root]);
  });

  it("has nothing to copy for an app it does not know", async () => {
    expect(await sourceOf([]).snapshot("app:nope", TAKEN_AT_MS, false)).toEqual({ kind: "unknown" });
  });
});

describe("placeSnapshot", () => {
  const FILES = [
    { path: ".blueprint/source/source.json", content: "{}" },
    { path: ".blueprint/source/collections/books/views/board.html", content: "<p/>" },
  ];

  it("writes every file, making the folders it needs", async () => {
    expect(await placeSnapshot(root, FILES)).toEqual({ clashes: [] });
    expect(await readFile(path.join(root, ".blueprint/source/collections/books/views/board.html"), "utf8")).toBe("<p/>");
  });

  it("writes nothing when an earlier copy is there, and names what clashed", async () => {
    await mkdir(path.join(root, ".blueprint/source"), { recursive: true });
    await writeFile(path.join(root, ".blueprint/source/source.json"), "old");
    expect(await placeSnapshot(root, FILES)).toEqual({ clashes: [".blueprint/source/source.json"] });
    expect(await readFile(path.join(root, ".blueprint/source/source.json"), "utf8")).toBe("old");
    expect(await readdir(path.join(root, ".blueprint/source"))).toEqual(["source.json"]);
  });

  it("writes nothing through a folder on the way that is a link out of the build's folder, and names it", async () => {
    const outside = path.join(root, "outside");
    const project = path.join(root, "project");
    await mkdir(outside);
    await mkdir(path.join(project, ".blueprint"), { recursive: true });
    await symlink(outside, path.join(project, ".blueprint/source"));
    expect(await placeSnapshot(project, FILES)).toEqual({ clashes: [".blueprint/source"] });
    expect(await readdir(outside)).toEqual([]);
  });

  it("writes nothing when a folder on the way is a file", async () => {
    await writeFile(path.join(root, ".blueprint"), "not a folder");
    expect(await placeSnapshot(root, FILES)).toEqual({ clashes: [".blueprint"] });
    expect(await readdir(root)).toEqual([".blueprint"]);
  });

  it("places nothing for an empty copy", async () => {
    expect(await placeSnapshot(root, [])).toEqual({ clashes: [] });
    expect(await readdir(root)).toEqual([]);
  });
});
