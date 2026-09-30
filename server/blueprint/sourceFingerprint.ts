// What a copy of a build's source holds, as one hash: taken again later from the same source, a different hash means the
// source changed. `source.json` is left out, since it records when the copy was taken and so always differs.
import { createHash } from "node:crypto";
import { RECORDS_FILE, SOURCE_DIR } from "../../common/blueprint/collectionSource.js";
import type { SnapshotFile } from "./collectionSnapshot.js";

export const SOURCE_RECORD_PATH = `${SOURCE_DIR}/source.json`;

// The order a store lists records in is not promised, so a records file counts by its lines, not their order.
const comparableContent = (file: SnapshotFile): Buffer => {
  if (!file.path.endsWith(`/${RECORDS_FILE}`)) return Buffer.from(file.content);
  const lines = file.content
    .toString()
    .split("\n")
    .filter((line) => line !== "");
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
