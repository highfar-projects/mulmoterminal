// @vitest-environment node
// The Cloudflare import check's reader, run against a stand-in `wrangler` package that answers from a SQLite file and a
// folder of objects, the way the real one answers from D1 and R2: it must find every record with every stored field,
// page through a long table, and find every pointed-at file with the source's bytes — and say what is wrong when
// anything is not so. (import-d1.sh itself was run against the real wrangler when it was written.)
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";

const VERIFY = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "from-collection", "checks", "d1-verify.mjs");
const describeSh = describe.skipIf(process.platform === "win32");
const PAGE_SIZE = 1000;

// `wrangler d1 execute DB --json --command <sql> …` runs the statement on $STANDIN_DB and prints what wrangler
// prints; `wrangler r2 object get <bucket>/<key> --file <out> …` copies $STANDIN_R2/<bucket>/<key>, and — as the
// real one does — exits 0 with an empty file and a message when the key does not exist.
const STANDIN_WRANGLER = `const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const args = process.argv.slice(2);
const at = (flag) => args[args.indexOf(flag) + 1];
if (args.includes("d1")) {
  const db = new DatabaseSync(process.env.STANDIN_DB);
  try {
    const rows = db.prepare(at("--command")).all();
    process.stdout.write(JSON.stringify([{ results: rows, success: true, meta: {} }]));
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: { text: error.message } }));
    process.exit(1);
  }
} else if (args.includes("r2")) {
  const object = process.env.STANDIN_R2 + "/" + args[args.indexOf("get") + 1];
  if (fs.existsSync(object)) fs.copyFileSync(object, at("--file"));
  else { fs.writeFileSync(at("--file"), ""); console.error("The specified key does not exist."); }
}
`;

let dir = "";
const put = (file: string, content: string | Buffer) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
};
const jsonl = (items: readonly object[]) => items.map((item) => `${JSON.stringify(item)}\n`).join("");

const BOOKS = [
  { id: "b1", title: "One", lent: true, pages: 120, cover: "images/b1.png" },
  { id: "b2", title: "It's two", lent: false, pages: 12.5 },
];
const COVER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);

let db: DatabaseSync;
const insertBook = (book: Record<string, unknown>) =>
  db
    .prepare("INSERT INTO books (id, title, lent, pages, cover) VALUES (?, ?, ?, ?, ?)")
    .run(String(book.id), String(book.title), book.lent === true ? 1 : 0, Number(book.pages), typeof book.cover === "string" ? book.cover : null);

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-d1-verify-"));
  put("package.json", JSON.stringify({ name: "stand-in", private: true }));
  put("node_modules/wrangler/package.json", JSON.stringify({ name: "wrangler", bin: { wrangler: "./bin/wrangler.js" } }));
  put("node_modules/wrangler/bin/wrangler.js", STANDIN_WRANGLER);
  put(".blueprint/source/source.json", JSON.stringify({ from: "collection", collections: ["books"], records: true }));
  put(
    ".blueprint/source/collections/books/schema.json",
    JSON.stringify({
      primaryKey: "id",
      fields: { id: { type: "string" }, title: { type: "string" }, lent: { type: "boolean" }, pages: { type: "number" }, cover: { type: "image" } },
    }),
  );
  put(".blueprint/source/collections/books/records.jsonl", jsonl(BOOKS));
  put(".blueprint/source/files/images/b1.png", COVER);
  put(".blueprint/r2-bucket", "books-files\n");
  put("wrangler.jsonc", '{ "r2_buckets": [{ "binding": "FILES", "bucket_name": "books-files" }] }');
  put("r2/books-files/images/b1.png", COVER);
  db = new DatabaseSync(path.join(dir, "d1.sqlite"));
  db.exec("CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT, lent INTEGER, pages REAL, cover TEXT)");
  BOOKS.forEach(insertBook);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const verify = () => {
  const result = spawnSync(process.execPath, ["--no-warnings", VERIFY, "--local", "--persist-to", "state"], {
    cwd: dir,
    env: { ...process.env, STANDIN_DB: path.join(dir, "d1.sqlite"), STANDIN_R2: path.join(dir, "r2") },
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
};

describeSh("d1-verify", () => {
  it("passes when every record, field and file is in D1 and R2", () => {
    expect(verify()).toEqual({ status: 0, stderr: "" });
  });

  it.each([
    ["a record left out", () => db.exec("DELETE FROM books WHERE id = 'b2'"), "has 1 rows, the source had 2 records"],
    ["a field stored otherwise", () => db.exec("UPDATE books SET lent = 'true' WHERE id = 'b1'"), 'books id="b1": lent is "true", the source had true'],
    ["a table named otherwise", () => db.exec("ALTER TABLE books RENAME TO book"), "there is no table books"],
    ["a file not uploaded", () => rmSync(path.join(dir, "r2/books-files/images/b1.png")), "images/b1.png is not in the R2 bucket books-files"],
    ["a file with other bytes", () => put("r2/books-files/images/b1.png", "other"), "images/b1.png is not in the R2 bucket books-files"],
    ["no bucket named", () => rmSync(path.join(dir, ".blueprint/r2-bucket")), ".blueprint/r2-bucket does not name the R2 bucket"],
    ["a bucket wrangler.jsonc does not bind", () => put(".blueprint/r2-bucket", "elsewhere"), "names elsewhere, which wrangler.jsonc does not bind"],
  ])("fails with %s", (_label, change, message) => {
    change();
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("says what wrangler answered when D1 cannot be read", () => {
    rmSync(path.join(dir, "d1.sqlite"));
    mkdirSync(path.join(dir, "d1.sqlite"));
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wrangler d1 execute --local --persist-to state failed");
  });

  it("says so when the project has no wrangler", () => {
    rmSync(path.join(dir, "node_modules/wrangler"), { recursive: true });
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the project has no wrangler to read D1 and R2 with");
  });

  it("reads a table longer than one page", () => {
    const many = Array.from({ length: PAGE_SIZE + 5 }, (_unused, index) => ({ id: `m${index}`, title: `Book ${index}`, lent: false, pages: index }));
    put(".blueprint/source/collections/books/records.jsonl", jsonl([...BOOKS, ...many]));
    many.forEach(insertBook);
    expect(verify()).toEqual({ status: 0, stderr: "" });
    db.exec("DELETE FROM books WHERE id = 'm1003'");
    expect(verify().stderr).toContain('no row for id = "m1003"');
  });
});
