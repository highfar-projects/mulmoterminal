// What the import checks share: the copied source, which fields are compared, and how a stored value is held against
// the source's. Each check reads its own store (SQLite, D1, Firestore) and hands the values here.
import { existsSync, readFileSync } from "node:fs";

export const SOURCE = ".blueprint/source";
const MAX_REPORTED = 20;
// The field kinds whose value is kept as it is, under the field's key (spec/conversion.md).
const PLAIN = new Set(["string", "text", "email", "markdown", "number", "date", "datetime", "enum", "ref", "image", "file", "boolean"]);

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export const sourceCollections = () => readJson(`${SOURCE}/source.json`).collections;
export const schemaOf = (slug) => readJson(`${SOURCE}/collections/${slug}/schema.json`);
export const recordsOf = (slug) =>
  readFileSync(`${SOURCE}/collections/${slug}/records.jsonl`, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

export const plainFields = (schema) => Object.entries(schema.fields ?? {}).filter(([, spec]) => PLAIN.has(spec.type));
export const isFileField = (spec) => spec.type === "image" || spec.type === "file";
// A field the record left empty has nothing to carry over.
export const hasValue = (value) => value !== undefined && value !== null && value !== "";
export const labelOf = (schema, record) => `${schema.primaryKey}=${JSON.stringify(record[schema.primaryKey])}`;

/**
 * Whether a stored value is the source's. `booleanAs` says how the store holds a boolean — 0/1 in SQLite, itself in
 * Firestore; a number is compared as a number, anything else as its text.
 */
export function sameValue(type, sourceValue, stored, booleanAs) {
  if (type === "number") return Number(sourceValue) === Number(stored);
  const want = type === "boolean" ? booleanAs(sourceValue === true) : sourceValue;
  return String(want) === String(stored);
}

// Every file the records point at and the source holds, once.
export const pointedAtFiles = () => [
  ...new Set(
    sourceCollections().flatMap((slug) => {
      const fileKeys = plainFields(schemaOf(slug))
        .filter(([, spec]) => isFileField(spec))
        .map(([key]) => key);
      return recordsOf(slug).flatMap((record) =>
        fileKeys.map((key) => record[key]).filter((value) => hasValue(value) && existsSync(`${SOURCE}/files/${value}`)),
      );
    }),
  ),
];

// A SQL store (SQLite, D1): the table is the collection's slug with `-` as `_`, a column is the field's key, and a
// boolean is held as 0/1 (spec/conversion.md).
export const tableOf = (slug) => slug.replaceAll("-", "_");
const asColumn = (flag) => (flag ? 1 : 0);

// `at` is where the value sits: the collection, the record and its label, and how a missing file is told.
function columnProblems(at, key, spec, row) {
  const { slug, record, label, fileMissing } = at;
  const value = record[key];
  if (!hasValue(value)) return [];
  if (!(key in row)) return [`${slug}: table ${tableOf(slug)} has no column ${key}`];
  const problems = sameValue(spec.type, value, row[key], asColumn)
    ? []
    : [`${slug} ${label}: ${key} is ${JSON.stringify(row[key])}, the source had ${JSON.stringify(value)}`];
  const missing = isFileField(spec) && existsSync(`${SOURCE}/files/${value}`) && fileMissing(value);
  return missing ? [...problems, `${slug} ${label}: ${key} points at ${value}, which is ${missing}`] : problems;
}

/**
 * The rows of a collection's table held against its records: as many rows as records, and every stored field of every
 * record reads back equal. `rows` is every row of the table, or null when there is no such table. `fileMissing(path)`
 * says where a file the source holds is missing from ("not in data/files/"), or false when it is there; a store whose
 * files are checked elsewhere leaves it out.
 */
export function tableProblems(slug, rows, fileMissing = () => false) {
  const table = tableOf(slug);
  if (rows === null) return [`${slug}: there is no table ${table}`];
  const schema = schemaOf(slug);
  const records = recordsOf(slug);
  const primary = schema.primaryKey;
  const counted = rows.length === records.length ? [] : [`${slug}: table ${table} has ${rows.length} rows, the source had ${records.length} records`];
  // The first row for a key, as a lookup by key reads it; a second one is already counted above.
  const byKey = rows.reduce((found, row) => (found.has(String(row[primary])) ? found : found.set(String(row[primary]), row)), new Map());
  const perRecord = records.flatMap((record) => {
    const row = byKey.get(String(record[primary]));
    if (!row) return [`${slug}: no row for ${primary} = ${JSON.stringify(record[primary])}`];
    return plainFields(schema).flatMap(([key, spec]) => columnProblems({ slug, record, label: labelOf(schema, record), fileMissing }, key, spec, row));
  });
  return [...counted, ...perRecord];
}

/** Prints the problems, at most a screenful, and exits 1 when there are any. */
export function report(problems) {
  if (problems.length === 0) return;
  console.error(problems.slice(0, MAX_REPORTED).join("\n"));
  if (problems.length > MAX_REPORTED) console.error(`… and ${problems.length - MAX_REPORTED} more`);
  process.exit(1);
}
