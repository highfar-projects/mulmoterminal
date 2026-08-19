// Wait for something to become true, rather than for a length of time.
//
// A fixed sleep is two costs in one. It is always paid in full — nine of them at 300ms in a single
// spec — and it is still a guess: on the slowest runner in the matrix the guess is wrong, and the
// spec then fails with an `ENOENT` that says nothing about what actually went wrong (#1796).
//
// Polling costs nothing when the answer is already there, which is the usual case. The cap only
// decides how a genuine failure is REPORTED — and reporting it as "this never happened" beats
// reporting it as a missing directory.
const POLL_MS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;

/** The predicate is SYNCHRONOUS on purpose. This helper's contract is a deadline — "waited 10000ms
 *  and X never happened" — and awaiting a caller's promise inside the loop would let that promise
 *  outlive the deadline, or never settle at all, turning a clear failure into a hang reported
 *  against vitest's own timeout (CodeRabbit on #1798). Every condition it exists for is a cheap
 *  read of something already on disk or in memory. A caller that genuinely needs to await
 *  something wants `hopUntil`'s `until`, whose bound is hops rather than time. */
export async function untilTrue(done: () => boolean, what: string, timeout_ms: number = DEFAULT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeout_ms;
  for (;;) {
    if (done()) return;
    if (Date.now() >= deadline) throw new Error(`waited ${timeout_ms}ms and ${what} never happened`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
