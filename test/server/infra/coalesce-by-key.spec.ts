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
