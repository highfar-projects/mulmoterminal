// The one line a session moved off a spent credential prints when its next process starts (#2919).
// Kept between the two halves of the move — the hook that ends the old process, and the spawn the
// cell's reconnect makes — because the token the new process lands on is only known at that spawn.
import type { MovedFrom } from "./limit-rotation.js";

const movedFrom = new Map<string, MovedFrom>();

export const noteMovedFrom = (sessionId: string, move: MovedFrom): void => {
  movedFrom.set(sessionId, move);
};

/** What a session was moved off, once: the line is printed by the first spawn after the move. */
export function takeMovedFrom(sessionId: string): MovedFrom | undefined {
  const move = movedFrom.get(sessionId);
  movedFrom.delete(sessionId);
  return move;
}

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** The terminal line itself. Dimmed and bracketed like the other lines this server writes there. */
const REASON_TEXT: Record<MovedFrom["reason"], string> = {
  "limit-hit": "reached its usage limit",
  "near-limit": "is close to its usage limit",
};

export const movedNoticeLine = ({ fromLabel, reason }: MovedFrom, toLabel: string): string =>
  `\r\n${DIM}[mulmoterminal] ${fromLabel} ${REASON_TEXT[reason]} — continuing this conversation on ${toLabel}.${RESET}\r\n`;
