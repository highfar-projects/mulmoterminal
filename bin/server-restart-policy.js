// Pure decision for whether/when a crashed server child comes back. Split out (rather than
// duplicated inline) so it can be shared by both callers that spawn server/index.ts and cannot
// import each other: the production launcher (bin/mulmoterminal.js, which npm actually ships) and
// the dev supervisor (scripts/dev-server.mjs, which is NOT shipped — the reverse import would work
// today but silently stop existing the moment someone runs this from an installed package).
//
// The policy itself, and the #1735 story behind it, is scripts/dev-server-config.js's: a supervisor
// that decided from how FAST the process died was wrong, because the server does its whole setup
// (seeding docs, syncing skills, registering scheduler tasks) BEFORE it binds the port — so a busy
// port took ~3s to fail, longer than any "fast crash" window, and every attempt reset the backoff
// to its floor and respawned a full boot every few seconds forever. Counting CONSECUTIVE FAILURES
// instead, reset only by the child itself reporting it bound the port, has no such window to slip
// through.

/**
 * What to do about a server child that just exited: come back, back off, or stop trying.
 *
 * `portInUseCode` is the one exit this must never retry — the port will still be taken next time,
 * and every attempt re-runs setup with real side effects (files written into the user's home).
 * Passed in rather than imported: the two callers each already own their own copy of that constant,
 * pinned against server/infra/server-exit.ts by their own specs, and this file has no business
 * being a third place that value has to be kept in sync.
 *
 * @param {{ code: number | null, signal: string | null, consecutiveFailures: number,
 *           minDelayMs: number, maxDelayMs: number, portInUseCode: number }} exit
 * @returns {{ retry: boolean, delayMs: number, reason: string }}
 */
export function restartPlan({ code, signal, consecutiveFailures, minDelayMs, maxDelayMs, portInUseCode }) {
  if (code === portInUseCode) {
    return {
      retry: false,
      delayMs: 0,
      reason: "the port is already in use — another instance is running. Free it, or set PORT=<n>, then retry.",
    };
  }
  const how = signal ? `signal ${signal}` : `code ${code}`;
  // First failure comes back at the floor; each one after doubles it. Doubling from the count
  // rather than from the previous delay means the caller holds no delay state to get stale.
  const delayMs = Math.min(minDelayMs * 2 ** Math.max(0, consecutiveFailures - 1), maxDelayMs);
  const loop = consecutiveFailures > 1 ? ` (${consecutiveFailures} in a row — crash loop? check the stack above)` : "";
  return { retry: true, delayMs, reason: `the server exited (${how}) — restarting in ${delayMs}ms${loop}` };
}
