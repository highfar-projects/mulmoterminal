// Which account each session was started on, as it is read from and written back to disk (#2215).
//
// It has to OUTLIVE the pty, because the transcript does — and the transcript lives in the
// ACCOUNT's home, so without this a resumed session, its cost, title and history would all be
// looked for in the default home and read as absent. For the same reason the HOME is recorded
// beside the id: a session keeps the directory it was written to even after its account is
// renamed or removed from the config.
//
// An append log with its own file, for the reasons custom-agent-log.ts gives: several servers and
// several builds share ~/.mulmoterminal, appending needs no read, and an older build ignores a
// file it has never heard of.
import { isAccountAgent, isAccountHome, isAccountId, type AccountAgent } from "../../common/agentAccounts.js";

export interface AccountSession {
  sessionId: string;
  agent: AccountAgent;
  accountId: string;
  /** The resolved, absolute config home the session was started with. */
  home: string;
}

/** One line of the log. */
export function accountSessionLine(record: AccountSession): string {
  return `${JSON.stringify(record)}\n`;
}

/** The record a parsed line holds, or null for anything unusable. The home must be absolute: it
 *  is used as the session's config home, and a relative one would move with the server's cwd. */
export function accountSessionRecord(parsed: Record<string, unknown>, isValidSessionId: (id: string) => boolean): AccountSession | null {
  const { sessionId, agent, accountId, home } = parsed;
  if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) return null;
  if (!isAccountAgent(agent) || !isAccountId(accountId)) return null;
  if (typeof home !== "string" || !isAccountHome(home) || home.startsWith("~")) return null;
  return { sessionId, agent, accountId, home };
}

/** Fold one record into the map. A session is bound once and never moves (its transcript cannot),
 *  so the FIRST line for a session wins. */
export function applyAccountSession(sessions: Map<string, AccountSession>, record: AccountSession): void {
  if (!sessions.has(record.sessionId)) sessions.set(record.sessionId, record);
}
