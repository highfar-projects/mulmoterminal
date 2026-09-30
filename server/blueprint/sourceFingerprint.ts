// What a copy of a build's source holds, as one hash: taken again later from the same source, a different hash means the
// source changed. `source.json` is left out, since it records when the copy was taken and so always differs.
import { createHash } from "node:crypto";
import { RECORDS_FILE, SOURCE_DIR } from "../../common/blueprint/collectionSource.js";
import type { SnapshotFile } from "./collectionSnapshot.js";

export const SOURCE_RECORD_PATH = `${SOURCE_DIR}/source.json`;

// A record's keys in one order, so the same values read back in another order are the same record.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
};

const canonicalLine = (line: string): string => {
  try {
    return JSON.stringify(canonical(JSON.parse(line)));
  } catch {
    return line;
  }
};

// A collection's records, not a file a record points at that happens to share the name.
const isRecordsFile = (filePath: string): boolean => {
  const parts = filePath.split("/");
  return filePath.startsWith(`${SOURCE_DIR}/collections/`) && parts.length === SOURCE_DIR.split("/").length + 3 && parts.at(-1) === RECORDS_FILE;
};

// The order a store lists records in is not promised, so a records file counts by its lines, not their order.
const comparableContent = (file: SnapshotFile): Buffer => {
  if (!isRecordsFile(file.path)) return Buffer.from(file.content);
  const lines = file.content
    .toString()
    .split("\n")
    .filter((line) => line !== "")
    .map(canonicalLine);
  return Buffer.from(lines.toSorted((a, b) => a.localeCompare(b)).join("\n"));
};

export function sourceFingerprint(files: readonly SnapshotFile[]): string {
  const hash = createHash("sha256");
  files
    .filter((file) => file.path !== SOURCE_RECORD_PATH)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .forEach((file) => {
      const content = comparableContent(file);
      hash.update(`${file.path}\0${content.length}\0`);
      hash.update(content);
    });
  return `sha256:${hash.digest("hex")}`;
}
