// @vitest-environment node
// The rule under test: the browser hears about copy-mode exactly when tmux's answer CHANGES, from the
// newest probe only — a missed change leaves a user typing into nothing with no banner (#2207), and
// a stale one takes the banner down while keys are still being eaten.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPaneModeWatch } from "../../../server/session/pane-mode-watch.js";

const A = "11111111-2222-3333-4444-555555555555";
const B = "66666666-7777-8888-9999-000000000000";
const SETTLE_MS = 100;
const SLOW_PROBE_MS = 50;

type Answer = boolean | null | Error;

// `answers` is what tmux will say, per probe, so a test can say "in, then out". A probe with a
// duration lets a newer request overtake it.
function setup(answers: Answer[], probeMs: (call: number) => number = () => 0) {
  const published: Array<[string, boolean]> = [];
  const asked: string[] = [];
  let call = 0;
  const watch = createPaneModeWatch({
    inModeOf: async (id) => {
      const mine = call++;
      asked.push(id);
      const wait = probeMs(mine);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const answer = answers[Math.min(mine, answers.length - 1)];
      if (answer instanceof Error) throw answer;
      return answer ?? null;
    },
    publish: (id, inCopyMode) => published.push([id, inCopyMode]),
    settleMs: SETTLE_MS,
  });
  return { watch, published, asked };
}

const settle = () => vi.advanceTimersByTimeAsync(SETTLE_MS + SLOW_PROBE_MS);

describe("createPaneModeWatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("probes once for a burst of input, after it settles", async () => {
    const { watch, asked } = setup([true]);
    watch.requestCheck(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
    watch.requestCheck(A);
    watch.requestCheck(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS - 1);
    expect(asked).toEqual([]);
    await settle();
    expect(asked).toEqual([A]);
  });

  it("publishes the first answer, then only changes", async () => {
    const { watch, published } = setup([true, true, false, false, true]);
    for (let i = 0; i < 5; i++) {
      watch.requestCheck(A);
      await settle();
    }
    expect(published).toEqual([
      [A, true],
      [A, false],
      [A, true],
    ]);
  });

  // An unreadable pane is not a pane that left copy-mode.
  it("publishes nothing for an answer tmux could not give, and keeps the last one", async () => {
    const { watch, published } = setup([true, null, true, false]);
    for (let i = 0; i < 4; i++) {
      watch.requestCheck(A);
      await settle();
    }
    expect(published).toEqual([
      [A, true],
      [A, false],
    ]);
  });

  it("survives a probe that throws, and answers the next request", async () => {
    const { watch, published } = setup([new Error("tmux gone"), true]);
    watch.requestCheck(A);
    await settle();
    expect(published).toEqual([]);
    watch.requestCheck(A);
    await settle();
    expect(published).toEqual([[A, true]]);
  });

  it("drops a slow answer that a newer probe has overtaken", async () => {
    // The first probe says "in" slowly; the second says "out" at once and must be the last word.
    const { watch, published } = setup([true, false], (call) => (call === 0 ? SLOW_PROBE_MS * 4 : 0));
    watch.requestCheck(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    watch.requestCheck(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS * 10);
    expect(published).toEqual([[A, false]]);
  });

  it("keeps sessions apart", async () => {
    const { watch, published, asked } = setup([true, false]);
    watch.requestCheck(A);
    watch.requestCheck(B);
    await settle();
    expect(asked.sort()).toEqual([A, B].sort());
    expect(published).toHaveLength(2);
    expect(new Set(published.map(([id]) => id))).toEqual(new Set([A, B]));
  });

  // A new socket starts from "not in copy-mode", so an unchanged "in" has to be said again.
  it("re-publishes an unchanged state after a fresh check", async () => {
    const { watch, published } = setup([true]);
    watch.requestCheck(A);
    await settle();
    watch.requestCheck(A);
    await settle();
    expect(published).toEqual([[A, true]]);
    watch.requestFreshCheck(A);
    await settle();
    expect(published).toEqual([
      [A, true],
      [A, true],
    ]);
  });

  it("forget drops a pending probe and frees the session", async () => {
    const { watch, asked, published } = setup([true]);
    watch.requestCheck(A);
    expect(watch.trackedSessionCount()).toBe(1);
    watch.forget(A);
    expect(watch.trackedSessionCount()).toBe(0);
    await settle();
    expect(asked).toEqual([]);
    expect(published).toEqual([]);
  });

  it("an answer landing after forget is not published", async () => {
    const { watch, published } = setup([true], () => SLOW_PROBE_MS * 4);
    watch.requestCheck(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    watch.forget(A);
    await vi.advanceTimersByTimeAsync(SETTLE_MS * 10);
    expect(published).toEqual([]);
  });

  it("forget on a session it never saw allocates nothing", () => {
    const { watch } = setup([true]);
    watch.forget(A);
    expect(watch.trackedSessionCount()).toBe(0);
  });
});
