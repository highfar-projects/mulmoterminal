// @vitest-environment node
// Which collections and files a build starting from a collection copies: every linked collection once, a missing one
// named rather than skipped, and only the view and template files a schema declares inside its own folder.
import { describe, expect, it } from "vitest";
import { CollectionSchemaZ } from "@mulmoclaude/core/collection/server";
import type { CollectionSchema } from "@mulmoclaude/core/collection";
import {
  SOURCE_DIR,
  collectionClosure,
  declaredSkillFiles,
  foldersAbove,
  linkedSlugs,
  recordsJsonl,
  referencedFiles,
  sourcePath,
  sourceRecord,
} from "../../../common/blueprint/collectionSource";

const field = (spec: object): object => ({ label: "x", ...spec });

const schema = (fields: Record<string, object> = {}, extra: object = {}): CollectionSchema =>
  CollectionSchemaZ.parse({
    title: "T",
    icon: "book",
    dataPath: "data/t/items",
    primaryKey: "id",
    fields: { id: field({ type: "string", primary: true }), ...fields },
    ...extra,
  });

const LINKED = schema({
  author: field({ type: "ref", to: "authors" }),
  lines: field({ type: "table", of: { pub: field({ type: "ref", to: "publishers" }) } }),
  shelf: field({ type: "embed", to: "shelves", idField: "id" }),
  reviews: field({ type: "backlinks", from: "reviews", via: "book", display: ["id"] }),
  total: field({ type: "rollup", from: "sales", via: "book", op: "count" }),
  again: field({ type: "ref", to: "authors" }),
});

describe("linkedSlugs", () => {
  it("names every collection a ref, a table's ref, an embed, a backlink or a rollup reads, once each", () => {
    expect([...linkedSlugs(LINKED)].sort()).toEqual(["authors", "publishers", "reviews", "sales", "shelves"]);
  });

  it("names none for a collection that links to nothing", () => {
    expect(linkedSlugs(schema({ name: field({ type: "string" }) }))).toEqual([]);
  });
});

describe("collectionClosure", () => {
  const graph =
    (edges: Record<string, string[]>) =>
    (slug: string): CollectionSchema | null =>
      slug in edges ? schema(Object.fromEntries((edges[slug] ?? []).map((to, index) => [`r${index}`, field({ type: "ref", to })]))) : null;

  it("puts the start first and follows links transitively", () => {
    const result = collectionClosure("a", graph({ a: ["b"], b: ["c"], c: [] }));
    expect(result).toEqual({ slugs: ["a", "b", "c"], missing: [] });
  });

  it("takes each collection once, through a cycle and a diamond", () => {
    const result = collectionClosure("a", graph({ a: ["b", "c"], b: ["d", "a"], c: ["d"], d: [] }));
    expect([...result.slugs].sort()).toEqual(["a", "b", "c", "d"]);
    expect(result.slugs[0]).toBe("a");
    expect(result.missing).toEqual([]);
  });

  it("names a linked collection that cannot be loaded, once, and keeps going", () => {
    const result = collectionClosure("a", graph({ a: ["gone", "b"], b: ["gone"] }));
    expect(result).toEqual({ slugs: ["a", "b"], missing: ["gone"] });
  });

  it("names the start itself as missing when it cannot be loaded", () => {
    expect(collectionClosure("nope", graph({}))).toEqual({ slugs: [], missing: ["nope"] });
  });
});

describe("declaredSkillFiles", () => {
  const withFiles = (views: string[], templates: string[], ingest?: string) =>
    schema(
      {},
      {
        views: views.map((file, index) => ({ id: `v${index}`, label: "v", file })),
        actions: templates.map((template, index) => ({ id: `a${index}`, label: "a", kind: "agent", role: "general", template })),
        ...(ingest ? { ingest: { kind: "agent", schedule: "daily", role: "general", template: ingest } } : {}),
      },
    );

  it("takes the declared views and action and ingest templates, sorted, once each", () => {
    expect(declaredSkillFiles(withFiles(["views/b.html", "views/a.html"], ["templates/t.md", "templates/t.md"], "templates/in.md"))).toEqual([
      "templates/in.md",
      "templates/t.md",
      "views/a.html",
      "views/b.html",
    ]);
  });

  it("takes a collection action's template too, and nothing from a mutate action", () => {
    const declared = schema(
      { status: field({ type: "string" }) },
      {
        actions: [{ id: "done", label: "Done", kind: "mutate", set: { status: "done" } }],
        collectionActions: [{ id: "help", label: "Help", kind: "chat", role: "general", template: "templates/help.md" }],
      },
    );
    expect(declaredSkillFiles(declared)).toEqual(["templates/help.md"]);
  });

  it("takes nothing from a schema that declares nothing", () => {
    expect(declaredSkillFiles(schema())).toEqual([]);
  });
});

describe("where the copy goes", () => {
  it("puts each collection's files under its own folder in the source", () => {
    expect(sourcePath("books", "views/a.html")).toBe(`${SOURCE_DIR}/collections/books/views/a.html`);
    expect(SOURCE_DIR).toBe(".blueprint/source");
  });

  it("records what was taken, from where and when", () => {
    expect(sourceRecord("books", { slugs: ["books", "authors"], missing: ["gone"] }, true, Date.UTC(2026, 8, 29))).toEqual({
      from: "collection",
      start: "books",
      collections: ["books", "authors"],
      missing: ["gone"],
      records: true,
      takenAt: "2026-09-29T00:00:00.000Z",
    });
    expect(sourceRecord("books", { slugs: ["books"], missing: [] }, false, 0).records).toBe(false);
  });
});

describe("foldersAbove", () => {
  it("names every folder the files sit under, once, outermost first", () => {
    expect(
      foldersAbove([".blueprint/source/source.json", ".blueprint/source/collections/books/views/a.html", ".blueprint/source/collections/books/SKILL.md"]),
    ).toEqual([
      ".blueprint",
      ".blueprint/source",
      ".blueprint/source/collections",
      ".blueprint/source/collections/books",
      ".blueprint/source/collections/books/views",
    ]);
  });

  it("names none for files at the top, or for no files", () => {
    expect(foldersAbove(["a.txt"])).toEqual([]);
    expect(foldersAbove([])).toEqual([]);
  });
});

describe("recordsJsonl", () => {
  it("writes one record per line, each line whole JSON, ending in a newline", () => {
    const text = recordsJsonl([
      { id: "a", note: "two\nlines" },
      { id: "b", n: 1 },
    ]);
    expect(text.split("\n")).toEqual(['{"id":"a","note":"two\\nlines"}', '{"id":"b","n":1}', ""]);
  });

  it("writes nothing for no records", () => {
    expect(recordsJsonl([])).toBe("");
  });
});

describe("referencedFiles", () => {
  const withFiles = schema({ cover: field({ type: "image" }), scan: field({ type: "file" }), title: field({ type: "string" }) });

  it("takes the paths image and file fields name, once each, sorted", () => {
    const items = [
      { id: "1", cover: "images/b.png", scan: "docs/a.pdf", title: "images/not-a-file.png" },
      { id: "2", cover: "images/b.png" },
    ];
    expect(referencedFiles(withFiles, items)).toEqual(["docs/a.pdf", "images/b.png"]);
  });

  it.each([["/etc/passwd"], ["../outside.png"], ["a/../../b.png"], ["a//b.png"], ["./a.png"], ["a\\b.png"], [""], ["a\u0000.png"]])(
    "leaves out %j, which is not a plain path inside the workspace",
    (value) => {
      expect(referencedFiles(withFiles, [{ id: "1", cover: value }])).toEqual([]);
    },
  );

  it("ignores values that are not text, and collections with no file fields", () => {
    expect(referencedFiles(withFiles, [{ id: "1", cover: 3, scan: null }])).toEqual([]);
    expect(referencedFiles(schema({ title: field({ type: "string" }) }), [{ id: "1", title: "a.png" }])).toEqual([]);
  });
});
