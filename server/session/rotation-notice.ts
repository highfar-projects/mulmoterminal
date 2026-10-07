// The one line a session moved off a spent credential prints when its next process starts (#2919).
// Kept between the two halves of the move — the hook that ends the old process, and the spawn the
// cell's reconnect makes — because the token the new process lands on is only known at that spawn.
const movedFrom = new Map<string, string>();

export const noteMovedFrom = (sessionId: string, fromLabel: string): void => {
  movedFrom.set(sessionId, fromLabel);
};

/** The label a session was moved off, once: the line is printed by the first spawn after the move. */
export function takeMovedFrom(sessionId: string): string | undefined {
  const label = movedFrom.get(sessionId);
  movedFrom.delete(sessionId);
  return label;
}

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** The terminal line itself. Dimmed and bracketed like the other lines this server writes there. */
export const movedNoticeLine = (fromLabel: string, toLabel: string): string =>
  `\r\n${DIM}[mulmoterminal] ${fromLabel} reached its usage limit — continuing this conversation on ${toLabel}.${RESET}\r\n`;
