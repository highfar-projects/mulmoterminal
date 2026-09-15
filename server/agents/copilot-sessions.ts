// A copilot session's own record of itself: the per-directory conversation list the launcher's
// "or resume here" offers, and the existence probe the survivor guard asks.
//
// Copilot keeps ONE sqlite index for the machine — `$COPILOT_HOME/session-store.db`, default
// `~/.copilot/session-store.db` — with the working directory recorded per row, so the listing is a
// query and not a directory walk (muse-session.ts has the same shape for the same reason).
//
// The existence probe does NOT go through sqlite. A session's data also lands in
// `session-state/<id>/`, and a directory test is synchronous, cheap, and true the moment the
// session starts — where the index row's `updated_at` is written "periodically during a session,
// and also when the session ends". The survivor guard runs once per reconnect burst across every
// surviving cell, so the cheap answer is the right one there.
import { existsSync } from "node:fs";
import path from "node:path";
import { readString } from "../../common/readString.js";
import { copilotHome } from "./copilot-hooks-file.js";
import { queryReadOnlySqlite, type SqliteRow as Row } from "./sqlite-read.js";

export const copilotSessionStatePath = (home: string = copilotHome()): string => path.join(home, "session-state");
const sessionStorePath = (home: string = copilotHome()): string => path.join(home, "session-store.db");

/** Is there a copilot session by this id ANYWHERE on this machine? The survivor guard's question,
 *  and deliberately a different one from the resume probe below.
 *
 *  The guard asks "what wrote this key" about a session that outlived a server restart, with no cwd
 *  to check against — the request that reattaches one often carries none. So the cheapest true
 *  answer is the right one: copilot wrote something under this id. Measured against 1.0.83:
 *  `session-state/<id>/` appears within two seconds of the spawn, before any turn. */
export const copilotSessionExists = (id: string, home: string = copilotHome()): boolean => existsSync(path.join(copilotSessionStatePath(home), id));

/** May a connection in `cwd` RESUME this id? A stricter question than the one above, and it is the
 *  one a resume has to ask.
 *
 *  Bound to the directory, as grok's probe is: a session id from another directory would otherwise
 *  be resumable here by hand-editing `?session=`, putting another project's conversation in this
 *  cell (Codex review on #2063). The listing the launcher offers is already filtered by cwd, so
 *  this closes the path that does not go through it.
 *
 *  Against the `sessions` TABLE rather than the state directory, because the table is what carries
 *  the cwd — and it is not a late writer: measured, a session that has run no turn at all already
 *  has its row, with the right `cwd`. */
export async function copilotSessionExistsForCwd(id: string, cwd: string): Promise<boolean> {
  const rows = await queryStore("SELECT 1 FROM sessions WHERE id = ? AND cwd = ? LIMIT 1", [id, cwd]);
  return rows.length > 0;
}

export interface CopilotSessionMeta {
  id: string;
  /** Copilot's own one-line summary of the conversation, or "" before it has written one. */
  title: string;
  /** `updated_at` as milliseconds, or 0 when it is missing or unparseable. */
  mtimeMs: number;
}

// Every query is BY the indexed key rather than a full scan filtered in JS: this file is read on a
// route a person is waiting on, and the store is shared with every copilot session on the machine.
function queryStore(sql: string, params: readonly string[] = []): Promise<Row[]> {
  return queryReadOnlySqlite(sessionStorePath(), sql, params);
}

/** Milliseconds from copilot's `updated_at`, or 0. Its own format is not ours to assume beyond
 *  "something Date can parse", so anything else reads as unknown rather than as now. */
export function copilotRowMtimeMs(value: unknown): number {
  const text = readString(value);
  if (!text) return 0;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : 0;
}

/** One row as the listing needs it, or null when it carries no usable id. */
export function copilotSessionMeta(row: Row): CopilotSessionMeta | null {
  const id = readString(row.id);
  if (!id) return null;
  return { id, title: readString(row.summary) ?? "", mtimeMs: copilotRowMtimeMs(row.updated_at) };
}

export async function listCopilotSessionsForCwd(cwd: string): Promise<CopilotSessionMeta[]> {
  const rows = await queryStore("SELECT id, summary, updated_at FROM sessions WHERE cwd = ?", [cwd]);
  return rows.map(copilotSessionMeta).filter((meta): meta is CopilotSessionMeta => meta !== null);
}
