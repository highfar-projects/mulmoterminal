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
import { isRecord } from "../../common/isRecord.js";
import { readString } from "../../common/readString.js";
import { copilotHome } from "./copilot-hooks-file.js";

export const copilotSessionStatePath = (home: string = copilotHome()): string => path.join(home, "session-state");
const sessionStorePath = (home: string = copilotHome()): string => path.join(home, "session-store.db");

/** Is there a copilot session by this id on this machine? The survivor guard's whole question.
 *
 *  By the session-state directory rather than the index: `--session-id` makes the key ours, so the
 *  only thing being asked is whether copilot ever wrote anything under it. */
export const copilotSessionExists = (id: string, home: string = copilotHome()): boolean => existsSync(path.join(copilotSessionStatePath(home), id));

export interface CopilotSessionMeta {
  id: string;
  /** Copilot's own one-line summary of the conversation, or "" before it has written one. */
  title: string;
  /** `updated_at` as milliseconds, or 0 when it is missing or unparseable. */
  mtimeMs: number;
}

type Row = Record<string, unknown>;

// Every query is BY the indexed key rather than a full scan filtered in JS: this file is read on a
// route a person is waiting on, and the store is shared with every copilot session on the machine.
async function queryStore(sql: string, params: readonly string[] = []): Promise<Row[]> {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(sessionStorePath(), { readOnly: true });
    try {
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
    // No copilot on this machine, no store yet, or a schema this build does not have. An empty
    // list is the honest answer and the launcher renders it as "nothing to resume".
    return [];
  }
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
