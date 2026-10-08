// Which rotation token each session's PROCESS was started on, as it is read from and written back
// to disk (#2919).
//
// Unlike an account, a token is not where a conversation lives: any token can resume any session,
// so a session is re-assigned every time a new process is started for it. What has to outlive the
// server is the CURRENT assignment, because a tmux reattach keeps the process — and the token it was
// started with — while the server's memory is gone. So the LAST line for a session wins.
//
// An append log with its own file, for the reasons custom-agent-log.ts gives.
import { DEFAULT_LOGIN_ID, isRotationTokenId } from "../../../common/tokenRotation.js";

export interface TokenSession {
  sessionId: string;
  /** A token id, DEFAULT_LOGIN_ID for the `/login` credential, or null for a process rotation did
   *  not start — which ends an earlier assignment rather than leaving it to be believed. */
  tokenId: string | null;
}

export const tokenSessionLine = (record: TokenSession): string => `${JSON.stringify(record)}\n`;

const isTokenRef = (value: unknown): value is string => value === DEFAULT_LOGIN_ID || isRotationTokenId(value);

/** The record a parsed line holds, or null for anything unusable. */
export function tokenSessionRecord(parsed: Record<string, unknown>, isValidSessionId: (id: string) => boolean): TokenSession | null {
  const { sessionId, tokenId } = parsed;
  if (typeof sessionId !== "string" || !isValidSessionId(sessionId) || (tokenId !== null && !isTokenRef(tokenId))) return null;
  return { sessionId, tokenId };
}

/** Fold one record into the map: the newest assignment replaces the one before it. */
export function applyTokenSession(sessions: Map<string, string>, record: TokenSession): void {
  if (record.tokenId === null) sessions.delete(record.sessionId);
  else sessions.set(record.sessionId, record.tokenId);
}
