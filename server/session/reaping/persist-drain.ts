// Everything queued for disk that nobody awaits, and the one place that waits for it.
//
// The session registry's appends are deliberately fire-and-forget — a tool call must not wait on a
// log — which is right until the process ends. `process.exit()` runs no pending microtask, so a
// burst queued just before Ctrl+C is not partially lost: measured on a 20-append burst, the file
// was never even created (#2161).
//
// A queue registers the way to READ its tail rather than the promise itself, because each append
// REPLACES the chain: `persist = persist.then(...)`. A registered promise would be whichever tail
// existed at registration — which is `Promise.resolve()`, and draining it would prove nothing.
type ReadTail = () => Promise<void>;

const queues: ReadTail[] = [];

/** Register a fire-and-forget persist chain so the exit path drains it. Pass a getter, not the
 *  promise — see above. Registering twice is harmless; the drain awaits whatever each returns. */
export function trackPersistQueue(readTail: ReadTail): void {
  queues.push(readTail);
}

/** Settles when every registered queue has settled. Rejections are absorbed: each chain already
 *  logs its own failure, and a failed write must not stop the others being waited for. */
export async function whenSessionStatePersisted(): Promise<void> {
  await Promise.allSettled(queues.map((readTail) => readTail()));
}

/** How long the exit path will wait. Short on purpose: a disk that has stopped answering must not
 *  turn Ctrl+C into a hang — losing the tail is the lesser failure, and the alternative is a
 *  server nobody can stop. */
export const PERSIST_DRAIN_TIMEOUT_MS = 1000;

/** True when the drain finished, false when the cap fired first. The caller exits either way; the
 *  answer is for the log, so an operator can tell a clean stop from a truncated one. */
export async function drainPersistQueues(timeoutMs: number = PERSIST_DRAIN_TIMEOUT_MS): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const capped = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    // Waiting to give up is never a reason to keep the process alive.
    timer.unref();
  });
  const drained = await Promise.race([whenSessionStatePersisted().then(() => true), capped]);
  clearTimeout(timer);
  return drained;
}

/** Test seam. The queue list is module state, so a spec that registers must be able to start from
 *  empty — otherwise the previous spec's chains are still being awaited. */
export function resetPersistQueuesForTest(): void {
  queues.length = 0;
}
