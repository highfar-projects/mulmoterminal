// Reads a database `yarn import-source` filled and holds it against the copied source: every collection's table has as
// many rows as it had records, every stored field of every record reads back equal, and every file a record points at
// is in data/files/. Prints each mismatch, and exits 1 when there is any.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { report, sourceCollections, tableOf, tableProblems } from "./compare.mjs";

const quoted = (name) => `"${name.replaceAll('"', '""')}"`;

function rowsOf(db, slug) {
  const table = tableOf(slug);
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  return exists ? db.prepare(`SELECT * FROM ${quoted(table)}`).all() : null;
}

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const notCopied = (file) => !existsSync(`data/files/${file}`) && "not in data/files/";
const problems = sourceCollections().flatMap((slug) => tableProblems(slug, rowsOf(db, slug), notCopied));
db.close();
report(problems);
