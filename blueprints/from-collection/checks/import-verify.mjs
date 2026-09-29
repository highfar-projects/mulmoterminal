// Reads a database `yarn import-source` filled and holds it against the copied source: every collection's table has as
// many rows as it had records, every stored field of every record reads back equal, and every file a record points at
// is in data/files/. Prints each mismatch, and exits 1 when there is any.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SOURCE, hasValue, isFileField, labelOf, plainFields, recordsOf, report, sameValue, schemaOf, sourceCollections } from "./compare.mjs";

const tableOf = (slug) => slug.replaceAll("-", "_");
const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
const asColumn = (flag) => (flag ? 1 : 0);

function fieldProblems(slug, key, spec, record, row, label) {
  const value = record[key];
  if (!hasValue(value)) return [];
  if (!(key in row)) return [`${slug}: table ${tableOf(slug)} has no column ${key}`];
  const problems = sameValue(spec.type, value, row[key], asColumn)
    ? []
    : [`${slug} ${label}: ${key} is ${JSON.stringify(row[key])}, the source had ${JSON.stringify(value)}`];
  const missingFile = isFileField(spec) && existsSync(`${SOURCE}/files/${value}`) && !existsSync(`data/files/${value}`);
  return missingFile ? [...problems, `${slug} ${label}: ${key} points at ${value}, which is not in data/files/`] : problems;
}

function collectionProblems(db, slug) {
  const schema = schemaOf(slug);
  const records = recordsOf(slug);
  const table = tableOf(slug);
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return [`${slug}: there is no table ${table}`];
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted(table)}`).get().n;
  const counted = count === records.length ? [] : [`${slug}: table ${table} has ${count} rows, the source had ${records.length} records`];
  const primary = schema.primaryKey;
  const fields = plainFields(schema);
  const find = db.prepare(`SELECT * FROM ${quoted(table)} WHERE ${quoted(primary)} = ?`);
  const perRecord = records.flatMap((record) => {
    const row = find.get(record[primary]);
    if (!row) return [`${slug}: no row for ${primary} = ${JSON.stringify(record[primary])}`];
    return fields.flatMap(([key, spec]) => fieldProblems(slug, key, spec, record, row, labelOf(schema, record)));
  });
  return [...counted, ...perRecord];
}

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const problems = sourceCollections().flatMap((slug) => collectionProblems(db, slug));
db.close();
report(problems);
