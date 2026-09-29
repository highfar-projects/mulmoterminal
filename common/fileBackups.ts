// A file's history as the browse routes send it (#2574) — the server lists it, the Files pane reads
// it, so the shape lives here once.
import { isRecord } from "./isRecord.js";

/** One stored generation. `id` is its name inside that file's own backup store — the only thing a
 *  reader may send back — `at` when it was taken (ms since the epoch), `bytes` its size. */
export interface BackupEntry {
  id: string;
  at: number;
  bytes: number;
}

const isBackupEntry = (value: unknown): value is BackupEntry =>
  isRecord(value) && typeof value.id === "string" && typeof value.at === "number" && typeof value.bytes === "number";

/** The `/api/files/browse/backups` answer's entries, or null for anything else. */
export const backupEntriesFrom = (body: unknown): BackupEntry[] | null =>
  isRecord(body) && Array.isArray(body.backups) && body.backups.every(isBackupEntry) ? body.backups : null;
