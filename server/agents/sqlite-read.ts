// One read-only query against an agent's own sqlite index.
//
// Two agents keep one: copilot (`$COPILOT_HOME/session-store.db`) and muse
// (`~/.local/share/muse/session-index.db`), both recording the working directory per row so a
// per-directory listing is a WHERE clause rather than a directory walk. Their own files say what
// each column means; this is the part that is the same in both.
//
// `node:sqlite` is imported HERE and nowhere else, and lazily: it is the only sqlite in the server,
// and a build running on a node without it must not fail to LOAD the calling module — an agent whose
// history cannot be listed is a missing list, not a broken server.
//
// Every failure answers `[]` for the same reason: before an agent's first session there is no
// database at all, which is indistinguishable from a schema that moved, and both mean "nothing to
// say" to every caller. The launcher renders it as "nothing to resume".
import { isRecord } from "../../common/isRecord.js";

export type SqliteRow = Record<string, unknown>;

export async function queryReadOnlySqlite(dbPath: string, sql: string, params: readonly (string | number)[] = []): Promise<SqliteRow[]> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      // Filtered rather than asserted: what sqlite hands back is a row shape this file does not own,
      // and every column is read through a guard at the call site anyway.
      const rows: unknown[] = db.prepare(sql).all(...params);
      return rows.filter(isRecord);
    } finally {
      try {
        db.close();
      } catch {
        // A close that fails leaves the caller nothing to do — the read is already answered.
      }
    }
  } catch {
    return [];
  }
}
