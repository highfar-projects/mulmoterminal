// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { dirtyCount, resetDirtyCountCache, DIRTY_COUNT_TTL_MS } from "./dirty-count";

const NOW = 1_700_000_000_000;

// A stand-in for `git status --porcelain` that stays pending until the test releases it, so a
// second call can be made while the first is still running — the situation the poller creates.
function deferredGit(stdout: string) {
  const calls: string[][] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const run = async (args: string[]): Promise<{ ok: boolean; stdout: string }> => {
    calls.push(args);
    await gate;
    return { ok: true, stdout };
  };
  return { run, calls, release };
}

describe("dirtyCount", () => {
  beforeEach(() => resetDirtyCountCache());

  it("counts non-blank porcelain lines", async () => {
    const run = async () => ({ ok: true, stdout: " M a.ts\n?? b.ts\n\n" });
    expect(await dirtyCount("/repo", { run, now: () => NOW })).toBe(2);
  });

  it("reports 0 when git fails", async () => {
    const run = async () => ({ ok: false, stdout: "" });
    expect(await dirtyCount("/repo", { run, now: () => NOW })).toBe(0);
  });

  // The guard that bounds the process count: however fast the poll ticks, one directory never
  // has two `git status` running at once.
  it("shares one call between callers that arrive while it is still running", async () => {
    const { run, calls, release } = deferredGit(" M a.ts\n");
    const now = () => NOW;

    const first = dirtyCount("/repo", { run, now });
    const second = dirtyCount("/repo", { run, now });
    const third = dirtyCount("/repo", { run, now });
    expect(calls).toHaveLength(1);

    release();
    expect(await Promise.all([first, second, third])).toEqual([1, 1, 1]);
    expect(calls).toHaveLength(1);
  });

  it("keeps separate directories independent", async () => {
    const { run, calls, release } = deferredGit(" M a.ts\n");
    const now = () => NOW;

    const a = dirtyCount("/repo-a", { run, now });
    const b = dirtyCount("/repo-b", { run, now });
    release();
    await Promise.all([a, b]);
    expect(calls).toHaveLength(2);
  });

  it("reuses a fresh answer and recomputes once it goes stale", async () => {
    let count = 0;
    const run = async () => ({ ok: true, stdout: `${++count === 1 ? " M a.ts" : " M a.ts\n?? b.ts"}\n` });
    let clock = NOW;
    const now = () => clock;

    expect(await dirtyCount("/repo", { run, now })).toBe(1);
    clock = NOW + DIRTY_COUNT_TTL_MS - 1;
    expect(await dirtyCount("/repo", { run, now })).toBe(1);
    expect(count).toBe(1);

    clock = NOW + DIRTY_COUNT_TTL_MS;
    expect(await dirtyCount("/repo", { run, now })).toBe(2);
    expect(count).toBe(2);
  });

  // A repo whose status times out is the one that must NOT be retried every tick.
  it("caches a failure too", async () => {
    let count = 0;
    const run = async () => {
      count++;
      return { ok: false, stdout: "" };
    };
    const now = () => NOW;

    expect(await dirtyCount("/repo", { run, now })).toBe(0);
    expect(await dirtyCount("/repo", { run, now })).toBe(0);
    expect(count).toBe(1);
  });

  it("releases the in-flight slot so a later call can run", async () => {
    const { run, calls, release } = deferredGit(" M a.ts\n");
    let clock = NOW;
    const now = () => clock;

    const first = dirtyCount("/repo", { run, now });
    release();
    await first;

    clock = NOW + DIRTY_COUNT_TTL_MS;
    await dirtyCount("/repo", { run, now });
    expect(calls).toHaveLength(2);
  });
});
