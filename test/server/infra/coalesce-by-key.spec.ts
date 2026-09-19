// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { coalesceByKey } from "../../../server/infra/coalesce-by-key.js";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Hands out `runs` in order. A call past the end is the failure these tests are looking for, so
 *  it throws rather than asserting away an undefined. `count` is how many were actually taken. */
function sequencedRuns(...runs: (() => Promise<string>)[]) {
  let taken = 0;
  return {
    next: (): Promise<string> => {
      const run = runs[taken++];
      if (!run) throw new Error("run() called more times than this test expects");
      return run();
    },
    get count(): number {
      return taken;
    },
  };
}

describe("coalesceByKey", () => {
  it("runs once for callers that overlap on the same key, and gives them all that answer", async () => {
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);
    const coalesce = coalesceByKey<string, string>();

    const all = Promise.all([coalesce("a", run), coalesce("a", run), coalesce("a", run)]);
    gate.resolve("answer");

    expect(await all).toEqual(["answer", "answer", "answer"]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys independent", async () => {
    const run = vi.fn(async (): Promise<string> => "x");
    const coalesce = coalesceByKey<string, string>();

    await Promise.all([coalesce("a", run), coalesce("b", run)]);

    expect(run).toHaveBeenCalledTimes(2);
  });

  // The point of holding no cache: once the work is done the key is free again, so the next
  // caller gets a fresh read rather than a remembered one.
  it("runs again for a caller that arrives after the previous run settled", async () => {
    const run = vi.fn(async (): Promise<string> => "x");
    const coalesce = coalesceByKey<string, string>();

    await coalesce("a", run);
    await coalesce("a", run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives every overlapping caller the same rejection, and frees the key afterwards", async () => {
    const gate = deferred<string>();
    const failing = vi.fn(() => gate.promise);
    const coalesce = coalesceByKey<string, string>();

    const first = coalesce("a", failing);
    const second = coalesce("a", failing);
    gate.reject(new Error("boom"));

    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(failing).toHaveBeenCalledTimes(1);

    // The key must not stay wedged by the failure.
    await expect(coalesce("a", async () => "recovered")).resolves.toBe("recovered");
  });

  // A `run` that throws synchronously never returns a promise, so without the async wrapper
  // `finally` would not be reached and the key would refuse every later call.
  it("turns a synchronous throw into a rejection and still frees the key", async () => {
    const coalesce = coalesceByKey<string, string>();

    await expect(
      coalesce("a", () => {
        throw new Error("sync boom");
      }),
    ).rejects.toThrow("sync boom");

    await expect(coalesce("a", async () => "after")).resolves.toBe("after");
  });
});

// #2164 review (Codex P2). Coalescing answers a joiner with a run that may have sampled the
// world BEFORE the joiner's reason for asking existed. For a caller that must observe
// something it just caused, that is staler than an uncoalesced call would have been.
describe("coalesceByKey — a fresh caller does not join a run that already sampled", () => {
  it("gives a fresh caller the world as it is NOW, not as the in-flight run found it", async () => {
    let world = "before-the-turn";
    const gate = deferred<"released">();
    const coalesce = coalesceByKey<string, string>();
    // Samples immediately, then grinds — exactly `git status` snapshotting then taking 56s.
    const run = async () => {
      const sampled = world;
      await gate.promise;
      return sampled;
    };

    const poll = coalesce("cwd", run);
    world = "after-the-turn";
    const forced = coalesce("cwd", run, { fresh: true });

    gate.resolve("released");
    expect(await poll).toBe("before-the-turn");
    expect(await forced).toBe("after-the-turn");
  });

  it("still coalesces when fresh is absent or false", async () => {
    const gate = deferred<string>();
    const run = vi.fn(() => gate.promise);
    const coalesce = coalesceByKey<string, string>();

    const a = coalesce("k", run);
    const b = coalesce("k", run, {});
    const c = coalesce("k", run, { fresh: false });
    gate.resolve("one");

    expect(await Promise.all([a, b, c])).toEqual(["one", "one", "one"]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("makes the fresh run the one later callers join", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const seq = sequencedRuns(
      () => first.promise,
      () => second.promise,
    );
    const coalesce = coalesceByKey<string, string>();

    const stale = coalesce("k", seq.next);
    const freshRun = coalesce("k", seq.next, { fresh: true });
    const joiner = coalesce("k", seq.next); // must join the FRESH one, not start a third

    first.resolve("stale");
    second.resolve("fresh");
    expect(await stale).toBe("stale");
    expect(await freshRun).toBe("fresh");
    expect(await joiner).toBe("fresh");
    expect(seq.count).toBe(2);
  });

  // The replaced run settles LAST here. Its `finally` must not delete the successor's entry,
  // or the next caller starts a third run while the second is still in flight.
  it("does not let a replaced run evict its successor on the way out", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const seq = sequencedRuns(
      () => first.promise,
      () => second.promise,
      () => Promise.resolve("THIRD"),
    );
    const coalesce = coalesceByKey<string, string>();

    const stale = coalesce("k", seq.next);
    const freshRun = coalesce("k", seq.next, { fresh: true });

    first.resolve("stale"); // the REPLACED run settles first
    await stale;

    const joiner = coalesce("k", seq.next);
    second.resolve("fresh");

    expect(await joiner).toBe("fresh");
    expect(await freshRun).toBe("fresh");
    expect(seq.count).toBe(2); // never reached the third run
  });
});
