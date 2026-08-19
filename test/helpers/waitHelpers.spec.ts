// @vitest-environment node
// Node, not jsdom: neither helper touches the DOM — `hop()` only needs a macrotask and a microtask
// flush — and `specEnvironmentDeclared.spec.ts` requires the declaration for everything under the
// server tsconfig's roots, which is what #1686 measured as 170 seconds of needless environment.
//
// The two waiting helpers, pinned at their own contracts — because both are things a spec TRUSTS
// while it is failing, and a wait that quietly does something other than what it says turns a real
// failure into a confusing one (#1796).
import { describe, it, expect, vi } from "vitest";
import { until } from "./hopUntil";
import { untilTrue } from "./untilTrue";

describe("until", () => {
  it("costs nothing when the answer is already there", async () => {
    const done = vi.fn(() => true);
    await until(done, "the thing");
    expect(done).toHaveBeenCalledTimes(1);
  });

  // The HOP count, not the check count — the two differ by exactly the bug CodeRabbit found on
  // #1798, and the check count alone cannot see it: `i <= HOPS_MAX` called `done` 201 times and
  // hopped 201 times, while the fixed loop calls `done` 201 times and hops 200. `hop()` is one
  // `setTimeout` and nothing else adds one here (measured: 3 hops => 3 calls), so counting them
  // counts hops.
  it("spends exactly the hops its message claims, and no more", async () => {
    const never = vi.fn(() => false);
    const hops = vi.spyOn(globalThis, "setTimeout");
    try {
      await expect(until(never, "the thing")).rejects.toThrow("waited 200 turns of the event loop for the thing");
      expect(hops).toHaveBeenCalledTimes(200);
      expect(never).toHaveBeenCalledTimes(201); // one before the first hop, one after each
    } finally {
      hops.mockRestore();
    }
  });

  it("stops as soon as the condition holds", async () => {
    let hops = 0;
    await until(() => ++hops === 3, "the thing");
    expect(hops).toBe(3);
  });

  it("names what it was waiting for, rather than leaving an undefined behind", async () => {
    await expect(until(() => false, "an answer from the parent")).rejects.toThrow(/for an answer from the parent, and it never came/);
  });

  it("takes an async predicate — the clipboard one is read on every hop", async () => {
    let hops = 0;
    await until(async () => Promise.resolve(++hops === 2), "the thing");
    expect(hops).toBe(2);
  });
});

describe("untilTrue", () => {
  it("returns without waiting when the condition already holds", async () => {
    const done = vi.fn(() => true);
    await untilTrue(done, "the file was never written");
    expect(done).toHaveBeenCalledTimes(1);
  });

  // The contract is a DEADLINE, so it has to be honoured — and the message has to say what was
  // being waited for, not just that something timed out.
  it("gives up at its deadline, saying what never happened", async () => {
    const started = Date.now();
    await expect(untilTrue(() => false, "the file was never written", 60)).rejects.toThrow("waited 60ms and the file was never written");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("returns as soon as the condition turns true", async () => {
    let checks = 0;
    await untilTrue(() => ++checks === 3, "the file was never written", 5000);
    expect(checks).toBe(3);
  });
});
