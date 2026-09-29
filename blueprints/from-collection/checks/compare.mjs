// What the import checks share: the copied source, which fields are compared, and how a stored value is held against
// the source's. Each check reads its own store (SQLite, Firestore) and hands the values here.
import { readFileSync } from "node:fs";

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

/** Prints the problems, at most a screenful, and exits 1 when there are any. */
export function report(problems) {
  if (problems.length === 0) return;
  console.error(problems.slice(0, MAX_REPORTED).join("\n"));
  if (problems.length > MAX_REPORTED) console.error(`… and ${problems.length - MAX_REPORTED} more`);
  process.exit(1);
}
