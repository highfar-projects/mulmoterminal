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
import { existsSync } from "node:fs";
import { isRecord } from "../../common/isRecord.js";

export type SqliteRow = Record<string, unknown>;

/**
 * Rows, or NULL when a store that IS THERE could not be read.
 *
 * The distinction exists because collapsing it is a lie a caller cannot detect: "this session has no
 * title" and "I could not open the database" both arrived as `[]`, and a reader that serialises the
 * second as "there is none" makes a client erase something correct (#2123, Codex round 4). Callers
 * that genuinely do not care say `?? []` and read exactly as before.
 *
 * A store that does NOT EXIST is `[]`, not null — and that line matters more than it looks. An agent
 * this machine has never run has no database, which is a definitive "no sessions here", not a
 * failure to read one; answering null would tell a client to keep showing whatever it had for an
 * agent that is not installed. CI found this where seven review rounds had not: the machine the loop
 * ran on HAS copilot's and muse's stores, so the missing-store path was never taken locally.
 */
export async function queryReadOnlySqlite(dbPath: string, sql: string, params: readonly (string | number)[] = []): Promise<SqliteRow[] | null> {
  // Asked before opening, because `DatabaseSync` cannot tell us WHY it failed.
  if (!existsSync(dbPath)) return [];
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
    return null; // unreadable — NOT the same as "no rows", see above
  }
}
