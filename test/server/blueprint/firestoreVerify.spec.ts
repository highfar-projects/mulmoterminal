// @vitest-environment node
// The Firebase import check's reader, run against a stand-in for the Firestore and Storage emulators' REST APIs: it
// must find every record with every stored field, page through a long collection, and find every pointed-at file in
// the bucket the import names — and say what is wrong when anything is not so.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const VERIFY = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "from-collection", "checks", "firestore-verify.mjs");
const PREFIX = "/v1/projects/demo-blueprint/databases/(default)/documents/";

type Value = Record<string, unknown>;
type Doc = { name: string; fields: Record<string, Value> };

// What the stand-in holds: documents per collection, objects per bucket, and how many documents a page returns.
let collections: Record<string, Doc[]> = {};
let objects = new Set<string>();
let pageSize = 300;

const doc = (collection: string, id: string, fields: Record<string, Value>): Doc => ({
  name: `projects/demo-blueprint/databases/(default)/documents/${collection}/${id}`,
  fields,
});

function answer(url: URL): { status: number; body: unknown } {
  if (url.pathname.startsWith("/v0/b/"))
    return objects.has(decodeURIComponent(url.pathname)) ? { status: 200, body: { name: "x" } } : { status: 404, body: {} };
  if (!url.pathname.startsWith(PREFIX)) return { status: 404, body: {} };
  const all = collections[decodeURIComponent(url.pathname.slice(PREFIX.length))] ?? [];
  const start = Number(url.searchParams.get("pageToken") ?? "0");
  const page = all.slice(start, start + pageSize);
  const next = start + pageSize < all.length ? { nextPageToken: String(start + pageSize) } : {};
  return { status: 200, body: page.length === 0 ? next : { documents: page, ...next } };
}

let server: Server;
let host = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    const { status, body } = answer(new URL(req.url ?? "/", "http://localhost"));
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  host = `127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

let dir = "";
const put = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
};
const jsonl = (items: readonly object[]) => items.map((item) => `${JSON.stringify(item)}\n`).join("");

const BOOKS = [
  { id: "b1", title: "One", lent: true, pages: 120, cover: "images/b1.png", author: "a1" },
  { id: "b2", title: "Two", lent: false },
];
const goodDocs = () => [
  doc("books", "b1", {
    title: { stringValue: "One" },
    lent: { booleanValue: true },
    pages: { integerValue: "120" },
    cover: { stringValue: "images/b1.png" },
    author: { stringValue: "a1" },
  }),
  doc("books", "b2", { title: { stringValue: "Two" }, lent: { booleanValue: false } }),
];

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-firestore-"));
  put(".blueprint/source/source.json", JSON.stringify({ collections: ["books"], records: true }));
  put(
    ".blueprint/source/collections/books/schema.json",
    JSON.stringify({
      primaryKey: "id",
      fields: {
        id: { type: "string" },
        title: { type: "string" },
        lent: { type: "boolean" },
        pages: { type: "number" },
        cover: { type: "image" },
        author: { type: "ref", to: "authors" },
      },
    }),
  );
  put(".blueprint/source/collections/books/records.jsonl", jsonl(BOOKS));
  put(".blueprint/source/files/images/b1.png", "png");
  put(".blueprint/storage-bucket", "demo-blueprint.appspot.com\n");
  collections = { books: goodDocs() };
  objects = new Set(["/v0/b/demo-blueprint.appspot.com/o/images/b1.png"]);
  pageSize = 300;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const verify = () =>
  new Promise<{ status: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings", VERIFY, "emulator"], {
      cwd: dir,
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: host, FIREBASE_STORAGE_EMULATOR_HOST: host, GCLOUD_PROJECT: "demo-blueprint" },
    });
    const errors: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
    child.on("close", (status) => resolve({ status, stderr: errors.join("") }));
  });

describe("firestore-verify against the emulators", () => {
  it("passes when every record, field and file is there", async () => {
    expect(await verify()).toEqual({ status: 0, stderr: "" });
  });

  it("reads a collection across pages", async () => {
    pageSize = 1;
    expect((await verify()).status).toBe(0);
  });

  it("fails on a missing document, and names it", async () => {
    collections = { books: goodDocs().slice(0, 1) };
    const result = await verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Firestore has 1 documents, the source had 2 records");
    expect(result.stderr).toContain('no document "b2"');
  });

  it("fails on a changed value, and on a boolean kept as a number", async () => {
    const [first, second] = goodDocs();
    collections = {
      books: [
        { ...first, fields: { ...first.fields, title: { stringValue: "Uno" } } },
        { ...second, fields: { ...second.fields, lent: { integerValue: "0" } } },
      ],
    };
    const result = await verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('title is "Uno", the source had "One"');
    expect(result.stderr).toContain("lent is 0, the source had false");
  });

  it("fails when a field is missing from its document", async () => {
    const [first, second] = goodDocs();
    const rest = Object.fromEntries(Object.entries(first.fields).filter(([key]) => key !== "pages"));
    collections = { books: [{ ...first, fields: rest }, second] };
    expect((await verify()).stderr).toContain("the document has no field pages");
  });

  it("fails when a pointed-at file is not in the bucket", async () => {
    objects = new Set();
    expect((await verify()).stderr).toContain("images/b1.png is not in the bucket demo-blueprint.appspot.com");
  });

  it("fails when the import did not say which bucket the files went to", async () => {
    rmSync(path.join(dir, ".blueprint/storage-bucket"));
    expect((await verify()).stderr).toContain(".blueprint/storage-bucket does not name the bucket");
  });

  it("does not ask for a bucket when the records point at no file the source holds", async () => {
    rmSync(path.join(dir, ".blueprint/source/files"), { recursive: true });
    rmSync(path.join(dir, ".blueprint/storage-bucket"));
    expect((await verify()).status).toBe(0);
  });
});
