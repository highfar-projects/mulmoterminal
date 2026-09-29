// @vitest-environment node
// The copy of a collection a build starts from: read from the skill folders (never through a link out of one), and
// written into the build's folder once — never over an earlier copy, and never half.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CollectionSchemaZ } from "@mulmoclaude/core/collection/server";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import { collectionSource, placeSnapshot } from "../../../server/blueprint/collectionSnapshot";

const TAKEN_AT_MS = Date.UTC(2026, 8, 29);

let root = "";
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "bp-collection-"));
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

describe("collectionSource", () => {
  it("offers the collections by slug and title, leaving out a shared app's", async () => {
    const books = await collection("books", {});
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const source = collectionSource(async () => [books, shared]);
    expect(await source.list()).toEqual([{ slug: "books", title: "T books" }]);
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
    const files = await collectionSource(async () => [books, authors, unrelated]).snapshot("books", TAKEN_AT_MS);
    expect(files?.map((file) => file.path).toSorted()).toEqual([
      ".blueprint/source/collections/authors/SKILL.md",
      ".blueprint/source/collections/authors/schema.json",
      ".blueprint/source/collections/authors/templates/help.md",
      ".blueprint/source/collections/books/SKILL.md",
      ".blueprint/source/collections/books/schema.json",
      ".blueprint/source/collections/books/views/board.html",
      ".blueprint/source/source.json",
    ]);
    const record = JSON.parse(files?.find((file) => file.path.endsWith("source.json"))?.content ?? "{}");
    expect(record).toEqual({
      from: "collection",
      start: "books",
      collections: ["books", "authors"],
      missing: ["missing"],
      takenAt: "2026-09-29T00:00:00.000Z",
    });
  });

  it("does not follow a link into a shared app's collection, and names it missing", async () => {
    const books = await collection("books", { votes: field({ type: "ref", to: "votes" }) });
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const files = await collectionSource(async () => [books, shared]).snapshot("books", TAKEN_AT_MS);
    expect(JSON.parse(files?.[0]?.content ?? "{}").missing).toEqual(["votes"]);
    expect(files?.some((file) => file.path.includes("/votes/"))).toBe(false);
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
    const files = await collectionSource(async () => [books]).snapshot("books", TAKEN_AT_MS);
    expect(files?.map((file) => file.path).filter((file) => file.includes("/views/"))).toEqual([]);
    expect(files?.some((file) => file.content === "secret")).toBe(false);
  });

  it("has nothing to copy for a collection it does not know, or a shared app's", async () => {
    const shared = { ...(await collection("votes", {})), appId: "aid-1" };
    const source = collectionSource(async () => [shared]);
    expect(await source.snapshot("nope", TAKEN_AT_MS)).toBeNull();
    expect(await source.snapshot("votes", TAKEN_AT_MS)).toBeNull();
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
