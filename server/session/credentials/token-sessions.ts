// Which rotation token each session runs on (#2919) — the in-memory map and its append log. The
// line format and the fold are in token-session-log.ts; this is the state and the disk.
import { promises as fs } from "node:fs";
import path from "node:path";
import { MULMOTERMINAL_HOME, SESSION_ID_RE } from "../../config/env.js";
import { hasErrnoCode, messageOf } from "../../errors.js";
import { forEachJsonlRecord } from "../../infra/fs/jsonl-file.js";
import { trackPersistQueue } from "../reaping/persist-drain.js";
import { applyTokenSession, tokenSessionLine, tokenSessionRecord } from "./token-session-log.js";

const isValidSessionId = (id: string) => SESSION_ID_RE.test(id);

const tokenSessions = new Map<string, string>();
// Assigned by THIS server. The log is older than any of them, so a spawn that lands before the
// hydration finishes must not be overwritten by the line it replaced.
const assignedThisRun = new Set<string>();
const TOKEN_SESSIONS_FILE = path.join(MULMOTERMINAL_HOME, "token-sessions.jsonl");
let hydrationDone = false;

export const tokenSessionsHydrated: Promise<void> = (async () => {
  try {
    await forEachJsonlRecord(TOKEN_SESSIONS_FILE, (parsed) => {
      const record = tokenSessionRecord(parsed, isValidSessionId);
      if (record && !assignedThisRun.has(record.sessionId)) applyTokenSession(tokenSessions, record);
    });
  } catch (err) {
    if (!hasErrnoCode(err) || err.code !== "ENOENT") console.error(`[token-sessions] could not read ${TOKEN_SESSIONS_FILE}: ${messageOf(err)}`);
  } finally {
    hydrationDone = true;
  }
})();

/** The token a session's process was started on, if it was started by rotation. */
export const sessionToken = (sessionId: string): string | undefined => tokenSessions.get(sessionId);

let tokenPersist: Promise<void> = Promise.resolve();
trackPersistQueue(() => tokenPersist);

/** Record the token a session's NEW process is starting on (null: not rotated), and persist it. */
export function rememberTokenSession(sessionId: string, tokenId: string | null): void {
  if (!isValidSessionId(sessionId)) return;
  // Before the log is read, "unchanged" cannot be told from "not loaded yet": the write goes ahead,
  // so a non-rotated restart is not undone by the older line hydration is about to apply.
  const unchanged = (tokenSessions.get(sessionId) ?? null) === tokenId;
  assignedThisRun.add(sessionId);
  if (unchanged && hydrationDone) return;
  applyTokenSession(tokenSessions, { sessionId, tokenId });
  tokenPersist = tokenPersist
    .then(() => fs.mkdir(MULMOTERMINAL_HOME, { recursive: true }))
    .then(() => fs.appendFile(TOKEN_SESSIONS_FILE, tokenSessionLine({ sessionId, tokenId })))
    .catch((e) => console.error(`[token-sessions] failed to persist: ${messageOf(e)}`));
}
