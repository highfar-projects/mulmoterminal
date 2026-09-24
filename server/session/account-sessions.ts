// Which account each session runs on (#2215) — the in-memory map and its append log. A session is
// bound once, when it is first started, and never moves: its transcript is in that account's home.
// The line format and the fold are in account-log.ts; this is the state and the disk.
import { promises as fs } from "node:fs";
import path from "node:path";
import { MULMOTERMINAL_HOME, SESSION_ID_RE } from "../config/env.js";
import { messageOf } from "../errors.js";
import { forEachJsonlRecord } from "../infra/jsonl-file.js";
import { trackPersistQueue } from "./persist-drain.js";
import { accountSessionLine, accountSessionRecord, applyAccountSession, type AccountSession } from "./account-log.js";

const isValidSessionId = (id: string) => SESSION_ID_RE.test(id);

export const accountSessions = new Map<string, AccountSession>();
const ACCOUNT_SESSIONS_FILE = path.join(MULMOTERMINAL_HOME, "account-sessions.jsonl");

export const accountSessionsHydrated: Promise<void> = (async () => {
  try {
    await forEachJsonlRecord(ACCOUNT_SESSIONS_FILE, (parsed) => {
      const record = accountSessionRecord(parsed, isValidSessionId);
      if (record) applyAccountSession(accountSessions, record);
    });
  } catch {
    // absent on first run / unreadable => every session reads from its agent's default home
  }
})();

let accountPersist: Promise<void> = Promise.resolve();
trackPersistQueue(() => accountPersist);

/** Bind a session to an account, and persist it. Call only after `accountSessionsHydrated`: a
 *  binding is first-wins, so binding before the log is read could shadow the recorded one. */
export function rememberAccountSession(record: AccountSession): void {
  if (!isValidSessionId(record.sessionId) || accountSessions.has(record.sessionId)) return;
  applyAccountSession(accountSessions, record);
  accountPersist = accountPersist
    .then(() => fs.mkdir(MULMOTERMINAL_HOME, { recursive: true }))
    .then(() => fs.appendFile(ACCOUNT_SESSIONS_FILE, accountSessionLine(record)))
    .catch((e) => console.error(`[account-sessions] failed to persist: ${messageOf(e)}`));
}
