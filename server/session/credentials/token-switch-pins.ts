// The subscription a user picked for a session's NEXT process (#2950). Held between the two halves of
// a switch — the route that ends the old process, and the spawn the cell's reconnect makes — because
// only the spawn knows the credential's secret is readable. Expiring, so a reconnect that never came
// cannot apply an old pick to some later restart.
export const SWITCH_PIN_TTL_MS = 60_000;

interface SwitchPin {
  tokenId: string;
  pinnedAtMs: number;
}

const pins = new Map<string, SwitchPin>();

export function pinSwitchedToken(sessionId: string, tokenId: string, nowMs: number = Date.now()): void {
  pins.set(sessionId, { tokenId, pinnedAtMs: nowMs });
}

/** The pick for a session's next process, once: a spawn consumes it, and a stale one reads as none. */
export function takeSwitchedToken(sessionId: string, nowMs: number = Date.now()): string | undefined {
  const pin = pins.get(sessionId);
  pins.delete(sessionId);
  if (!pin || nowMs - pin.pinnedAtMs > SWITCH_PIN_TTL_MS) return undefined;
  return pin.tokenId;
}

export const clearSwitchedToken = (sessionId: string): void => {
  pins.delete(sessionId);
};

/** A session with no transcript cannot be resumed, so the reconnect that follows a switch is handed a
 *  NEW id: the pick follows it, or the new process would be placed as if nothing had been chosen. */
export function carrySwitchedToken(fromSessionId: string, toSessionId: string): void {
  const pin = pins.get(fromSessionId);
  if (!pin || fromSessionId === toSessionId) return;
  pins.delete(fromSessionId);
  pins.set(toSessionId, pin);
}
