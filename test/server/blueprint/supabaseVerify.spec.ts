// @vitest-environment node
// The Supabase import check's reader, run against a stand-in Supabase CLI package that answers `db query` from a fixture
// of tables and `storage cp` from a folder of objects, the way the real CLI answered on a local stack when this check
// was written: dates come back in Postgres's own format, a boolean as itself, and a download of a missing object fails
// but leaves an empty file behind.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints");
const VERIFY = path.join(PACKS, "from-collection", "checks", "supabase-verify.mjs");
const describeSh = describe.skipIf(process.platform === "win32");

const STANDIN_CLI = `const fs = require("node:fs");
const tables = JSON.parse(fs.readFileSync(process.env.STANDIN_TABLES, "utf8"));
const args = process.argv.slice(2);
const answer = (rows) => { process.stdout.write(JSON.stringify({ boundary: "b", rows, warning: "w" })); process.exit(0); };
if (args[0] === "db" && args[1] === "query") {
  const sql = args.at(-1);
  const exists = sql.match(/tablename = '([^']+)'/);
  if (exists) answer(exists[1] in tables ? [{ found: 1 }] : []);
  const read = sql.match(/from public\\."([^"]+)"/);
  if (read) answer(tables[read[1]] ?? []);
}
if (args[0] === "storage" && args[1] === "cp") {
  const object = process.env.STANDIN_STORAGE + "/" + args[2].replace("ss:///", "");
  if (fs.existsSync(object)) { fs.copyFileSync(object, args[3]); process.exit(0); }
  fs.writeFileSync(args[3], "");
  process.stderr.write("Object not found");
  process.exit(1);
}
process.stderr.write("unexpected: " + args.join(" "));
process.exit(1);
`;

const COVER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const BOOKS = [
  { id: "b1", title: "One", lent: true, pages: 320, bought: "2026-01-02", cover: "covers/b1.png" },
  { id: "b2", title: "It's two", lent: false, pages: 12.5, bought: "2025-12-31" },
];
// As Postgres gives them back: a date at midnight UTC, numeric as text, a boolean as itself, and an owner column the
// source does not have.
const storedBook = (book: (typeof BOOKS)[number]) => ({
  ...book,
  bought: `${book.bought}T00:00:00Z`,
  pages: String(book.pages),
  cover: book.cover ?? null,
  owner: "00000000-0000-0000-0000-00000000a001",
});

let dir = "";
let tables: Record<string, Record<string, unknown>[]> = {};
const put = (file: string, content: string | Buffer) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content);
};

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-supabase-verify-"));
  put("package.json", JSON.stringify({ name: "stand-in", private: true }));
  put("node_modules/supabase/package.json", JSON.stringify({ name: "supabase", bin: { supabase: "dist/supabase.js" } }));
  put("node_modules/supabase/dist/supabase.js", STANDIN_CLI);
  put(".blueprint/source/source.json", JSON.stringify({ from: "collection", collections: ["shelf-books"], records: true }));
  put(
    ".blueprint/source/collections/shelf-books/schema.json",
    JSON.stringify({
      primaryKey: "id",
      fields: {
        id: { type: "string" },
        title: { type: "string" },
        lent: { type: "boolean" },
        pages: { type: "number" },
        bought: { type: "date" },
        cover: { type: "image" },
      },
    }),
  );
  put(".blueprint/source/collections/shelf-books/records.jsonl", BOOKS.map((book) => `${JSON.stringify(book)}\n`).join(""));
  put(".blueprint/source/files/covers/b1.png", COVER);
  put(".blueprint/supabase-bucket", "shelf-files\n");
  put("storage/shelf-files/covers/b1.png", COVER);
  tables = { shelf_books: BOOKS.map(storedBook) };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const verify = (...args: string[]) => {
  put("tables.json", JSON.stringify(tables));
  const result = spawnSync(process.execPath, ["--no-warnings", VERIFY, ...args], {
    cwd: dir,
    env: {
      ...process.env,
      BLUEPRINT_BASE: path.join(PACKS, "supabase"),
      STANDIN_TABLES: path.join(dir, "tables.json"),
      STANDIN_STORAGE: path.join(dir, "storage"),
    },
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr };
};

describeSh("supabase-verify", () => {
  it("passes when every record, field and file is in Postgres and Storage, dates read back in Postgres's format", () => {
    expect(verify("--local")).toEqual({ status: 0, stderr: "" });
  });

  it.each([
    ["a record left out", () => (tables.shelf_books = tables.shelf_books.slice(1)), "table shelf_books has 1 rows, the source had 2 records"],
    ["a boolean stored the other way", () => (tables.shelf_books[0].lent = false), 'shelf-books id="b1": lent is false, the source had true'],
    ["another date", () => (tables.shelf_books[0].bought = "2026-01-03T00:00:00Z"), 'shelf-books id="b1": bought is "2026-01-03T00:00:00Z"'],
    ["a table named otherwise", () => (tables = { shelf_book: tables.shelf_books }), "there is no table shelf_books"],
    ["a file not uploaded", () => rmSync(path.join(dir, "storage/shelf-files/covers/b1.png")), "covers/b1.png is not in the Storage bucket shelf-files"],
    ["a file with other bytes", () => put("storage/shelf-files/covers/b1.png", "other"), "covers/b1.png is not in the Storage bucket shelf-files"],
    ["no bucket named", () => rmSync(path.join(dir, ".blueprint/supabase-bucket")), ".blueprint/supabase-bucket does not name the Storage bucket"],
  ])("fails with %s", (_label, change, message) => {
    change();
    const result = verify("--local");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("leaves out the seed's own rows when counting, but not a seeded key a record also has", () => {
    tables.shelf_books.push({ id: "seed-1", title: "Seeded", owner: "x" });
    expect(verify("--local").stderr).toContain("has 3 rows, the source had 2 records");
    const seeded = path.join(dir, "seeded.json");
    expect(verify("--local", "--save-seeded", seeded).status).toBe(0);
    expect(verify("--local", "--seeded", seeded)).toEqual({ status: 0, stderr: "" });
    // A seeded key that a record also has is the record's row now: it still counts, and is still compared.
    tables.shelf_books[0].title = "Not One";
    expect(verify("--local", "--seeded", seeded).stderr).toContain('shelf-books id="b1": title is "Not One"');
  });

  it("says what the CLI answered when it fails", () => {
    rmSync(path.join(dir, "node_modules/supabase"), { recursive: true });
    expect(verify("--local").stderr).toContain("the project has no Supabase CLI");
  });
});
