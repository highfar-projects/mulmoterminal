// Moving a running session off a credential that just hit its limit (#2919).
//
// Claude Code reports the hit as a `StopFailure` hook with `error_type: "rate_limit"`. Only a
// session ROTATION started is moved: a provider session's 429 arrives the same way, and so does one
// from a session the user started on a credential of their own choosing — neither is ours to move.
//
// The move is the Restart button's (#1918) done from the server, minus the "[session ended]": the
// old process is ended with the cell's socket detached first, so no exit frame reaches it, and the
// socket is then closed bare. The cell treats that as a dropped connection and reconnects on its own
// id; the transcript is on disk, so that reconnect `--resume`s the conversation, and the spawn picks
// a credential with the spent one held out. The prompt that hit the limit is not re-sent.
import type { WebSocket } from "ws";
import type { PtyEntry } from "./types.js";

/** The part of a live session the move touches: which agent it runs, and its cell's socket. */
export type MovableSession = Pick<PtyEntry, "agent"> & { ws: Pick<WebSocket, "close"> | null };

export interface LimitRotationDeps {
  rotationEnabled: () => boolean;
  /** The credential the session's current process was started on by rotation, if it was. */
  sessionToken: (sessionId: string) => string | undefined;
  markSpent: (tokenId: string) => void;
  hasFreeChoice: () => boolean;
  entryOf: (sessionId: string) => MovableSession | undefined;
  reap: (sessionId: string) => void;
  labelOf: (tokenId: string) => string;
  noteMovedFrom: (sessionId: string, move: MovedFrom) => void;
  /** Whether the credential is at the switch line (token-choice.ts SWITCH_AT_PERCENT). */
  isNearLimit: (tokenId: string) => boolean;
}

/** Why a session moved, for its notice line. */
export type MoveReason = "limit-hit" | "near-limit" | "switched";

export interface MovedFrom {
  fromLabel: string;
  reason: MoveReason;
}

export type LimitRotationOutcome = "not-rotated" | "below-limit" | "no-session" | "no-free-credential" | "moved";

/** End the session's process with its socket detached so no exit frame reaches the cell, then close
 *  the socket bare: the cell's reconnect resumes the conversation on a fresh choice. */
function moveSession(deps: LimitRotationDeps, sessionId: string, tokenId: string, reason: MoveReason): LimitRotationOutcome {
  const entry = deps.entryOf(sessionId);
  if (!entry || entry.agent !== "claude") return "no-session";
  // Every other credential is held out too: a restart would land on one that fails the same way.
  // The session stays as it is.
  if (!deps.hasFreeChoice()) return "no-free-credential";
  const socket = entry.ws;
  entry.ws = null;
  deps.noteMovedFrom(sessionId, { fromLabel: deps.labelOf(tokenId), reason });
  deps.reap(sessionId);
  socket?.close();
  return "moved";
}

const rotatedToken = (deps: LimitRotationDeps, sessionId: string): string | undefined => (deps.rotationEnabled() ? deps.sessionToken(sessionId) : undefined);

/** What to do about a session whose turn just failed on a usage limit. */
export function rotateOnLimit(deps: LimitRotationDeps, sessionId: string): LimitRotationOutcome {
  const tokenId = rotatedToken(deps, sessionId);
  if (tokenId === undefined) return "not-rotated";
  deps.markSpent(tokenId);
  return moveSession(deps, sessionId, tokenId, "limit-hit");
}

/**
 * What to do about a session whose turn just ended normally: move it while it is between turns if its
 * credential is at the switch line, before a turn has to fail on the limit (#2919). The readings are
 * the probes', so the line can be crossed by a few percent before it is seen.
 */
export function rotateNearLimit(deps: LimitRotationDeps, sessionId: string): LimitRotationOutcome {
  const tokenId = rotatedToken(deps, sessionId);
  if (tokenId === undefined) return "not-rotated";
  if (!deps.isNearLimit(tokenId)) return "below-limit";
  return moveSession(deps, sessionId, tokenId, "near-limit");
}
