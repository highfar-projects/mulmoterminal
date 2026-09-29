// Reads a database `yarn import-source` filled and holds it against the copied source: every collection's table has as
// many rows as it had records, every stored field of every record reads back equal, and every file a record points at
// is in data/files/. Prints each mismatch, and exits 1 when there is any.
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SOURCE = ".blueprint/source";
// The field kinds whose value is kept as it is, in the column named by the key (spec/conversion.md, "表と列の名前").
const PLAIN = new Set(["string", "text", "email", "markdown", "number", "date", "datetime", "enum", "ref", "image", "file", "boolean"]);
const MAX_REPORTED = 20;

const tableOf = (slug) => slug.replaceAll("-", "_");
const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
const recordsOf = (slug) =>
  readFileSync(`${SOURCE}/collections/${slug}/records.jsonl`, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

// The value a column holds for a source value: a boolean is 0/1; anything else is compared as it was written.
const asColumn = (flag) => (flag === true ? 1 : 0);
const expected = (type, value) => (type === "boolean" ? asColumn(value) : value);
const same = (type, want, got) => (type === "number" ? Number(want) === Number(got) : String(want) === String(got));

function fieldProblems(slug, key, spec, record, row) {
  const value = record[key];
  if (value === undefined || value === null || value === "") return [];
  if (!(key in row)) return [`${slug}: table ${tableOf(slug)} has no column ${key}`];
  const want = expected(spec.type, value);
  const problems = same(spec.type, want, row[key])
    ? []
    : [`${slug} ${record.__id}: ${key} is ${JSON.stringify(row[key])}, the source had ${JSON.stringify(value)}`];
  const isFile = spec.type === "image" || spec.type === "file";
  const missingFile = isFile && existsSync(`${SOURCE}/files/${value}`) && !existsSync(`data/files/${value}`);
  return missingFile ? [...problems, `${slug} ${record.__id}: ${key} points at ${value}, which is not in data/files/`] : problems;
}

function collectionProblems(db, slug) {
  const schema = JSON.parse(readFileSync(`${SOURCE}/collections/${slug}/schema.json`, "utf8"));
  const records = recordsOf(slug);
  const table = tableOf(slug);
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return [`${slug}: there is no table ${table}`];
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(table)}`).get().n;
  const counted = count === records.length ? [] : [`${slug}: table ${table} has ${count} rows, the source had ${records.length} records`];
  const primary = schema.primaryKey;
  const fields = Object.entries(schema.fields ?? {}).filter(([, spec]) => PLAIN.has(spec.type));
  const find = db.prepare(`SELECT * FROM ${quoted(table)} WHERE ${quoted(primary)} = ?`);
  const perRecord = records.flatMap((record) => {
    const row = find.get(record[primary]);
    if (!row) return [`${slug}: no row for ${primary} = ${JSON.stringify(record[primary])}`];
    const labelled = { ...record, __id: `${primary}=${JSON.stringify(record[primary])}` };
    return fields.flatMap(([key, spec]) => fieldProblems(slug, key, spec, labelled, row));
  });
  return [...counted, ...perRecord];
}

const source = JSON.parse(readFileSync(`${SOURCE}/source.json`, "utf8"));
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const problems = source.collections.flatMap((slug) => collectionProblems(db, slug));
db.close();
if (problems.length > 0) {
  console.error(problems.slice(0, MAX_REPORTED).join("\n"));
  if (problems.length > MAX_REPORTED) console.error(`… and ${problems.length - MAX_REPORTED} more`);
  process.exit(1);
}
