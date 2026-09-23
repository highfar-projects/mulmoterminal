// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { trackPersistQueue, whenSessionStatePersisted, drainPersistQueues, resetPersistQueuesForTest } from "../../../server/session/persist-drain";

// What the exit path is for: `process.exit()` runs no pending microtask, so a burst of
// fire-and-forget appends queued just before Ctrl+C was lost WHOLE — measured on a real child
// process at 0 of 20 lines, with the file never created (#2161). These pin the two halves that
// matter: everything registered is awaited, and the wait cannot become a hang.

beforeEach(resetPersistQueuesForTest);

// One microtask is NOT enough to tell "waits for all" from "waits for the first": `allSettled`
// resolves a few ticks later either way, so the assertion passed against a mutation that awaited
// only queue one. Drain the macrotask queue instead, which puts any resolution that was going to
// happen firmly in the past.
const settleEverythingPending = () => new Promise<void>((resolve) => setImmediate(resolve));

const deferred = () => {
  let settle: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};

describe("whenSessionStatePersisted", () => {
  it("resolves immediately when nothing is registered", async () => {
    await expect(whenSessionStatePersisted()).resolves.toBeUndefined();
  });

  it("waits for every registered queue, not just the first", async () => {
    const a = deferred();
    const b = deferred();
    trackPersistQueue(() => a.promise);
    trackPersistQueue(() => b.promise);

    let settled = false;
    const waiting = whenSessionStatePersisted().then(() => {
      settled = true;
    });

    a.settle();
    await settleEverythingPending();
    expect(settled).toBe(false); // b is still out

    b.settle();
    await waiting;
    expect(settled).toBe(true);
  });

  // The reason a queue registers a GETTER: every append replaces the chain
  // (`persist = persist.then(...)`), so a promise captured at registration is the empty tail that
  // existed before any work — awaiting it would prove nothing while looking like it proved
  // everything. This is the assertion that fails if someone "simplifies" the API to take a promise.
  it("reads the queue's CURRENT tail at drain time, not the one registered", async () => {
    const first = deferred();
    let tail: Promise<void> = first.promise;
    trackPersistQueue(() => tail);
    first.settle();
    await first.promise;

    const second = deferred();
    tail = second.promise; // the queue moved on, as an append does

    let settled = false;
    const waiting = whenSessionStatePersisted().then(() => {
      settled = true;
    });
    await settleEverythingPending();
    expect(settled).toBe(false);

    second.settle();
    await waiting;
    expect(settled).toBe(true);
  });

  // A write that failed has already logged; it must not stop the others being waited for, and it
  // must not turn the exit path into an unhandled rejection.
  it("absorbs a rejected queue and still waits for the rest", async () => {
    const ok = deferred();
    trackPersistQueue(() => Promise.reject(new Error("disk full")));
    trackPersistQueue(() => ok.promise);

    let settled = false;
    const waiting = whenSessionStatePersisted().then(() => {
      settled = true;
    });
    await settleEverythingPending();
    expect(settled).toBe(false);

    ok.settle();
    await expect(waiting).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });
});

describe("drainPersistQueues — the cap", () => {
  it("reports true when the queues finish inside it", async () => {
    trackPersistQueue(() => Promise.resolve());
    await expect(drainPersistQueues(50)).resolves.toBe(true);
  });

  // Losing the tail is the lesser failure. A server nobody can stop is the greater one.
  it("gives up and reports false rather than hanging on a disk that never answers", async () => {
    vi.useFakeTimers();
    try {
      trackPersistQueue(() => new Promise<void>(() => {}));
      const drained = drainPersistQueues(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(drained).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

// The guard that makes the ELEVENTH queue impossible to forget. registry.ts holds ten
// fire-and-forget chains today; a new one added without registering is exactly the defect #2161
// is, arriving again. Derived from the source rather than a hand-kept list, so it fails CLOSED.
describe("every persist chain in the registry is registered with the drain", () => {
  it("has a trackPersistQueue for each `Promise<void> = Promise.resolve()` chain", () => {
    const registry = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "server", "session", "registry.ts"), "utf-8");
    const declared = [...registry.matchAll(/let (\w+): Promise<void> = Promise\.resolve\(\);/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(10); // the matcher itself must still match something

    const unregistered = declared.filter((name) => !registry.includes(`trackPersistQueue(() => ${name})`));
    expect(unregistered).toEqual([]);
  });
});
