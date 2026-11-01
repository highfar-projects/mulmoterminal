// Fork-only: the browser side of POST /api/restart — the overlay goes up on the reply, and the page
// reloads only once the OLD server has gone and a server answers again.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Answer = { ok: boolean; body?: unknown } | "down";

// What the server answers, in order: the restart request first, then each probe.
let answers: Answer[] = [];
const requested: string[] = [];
const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  answers = [];
  requested.length = 0;
  reload.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      const next = answers.shift() ?? "down";
      if (next === "down") throw new TypeError("Failed to fetch");
      return { ok: next.ok, status: next.ok ? 200 : 500, json: async () => next.body ?? {} };
    }),
  );
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const load = () => import("../../../src/composables/useServerRestart");

describe("restartLanded", () => {
  it.each([
    [false, true, false],
    [true, false, false],
    [false, false, false],
    [true, true, true],
  ])("seen gone %s, answering %s -> %s", async (sawDown, reachable, expected) => {
    expect((await load()).restartLanded(sawDown, reachable)).toBe(expected);
  });
});

describe("restartServer", () => {
  it("puts the overlay up on the reply and remembers whether a newer build can come back", async () => {
    answers = [{ ok: true, body: { restarting: true, relaunch: true } }];
    const m = await load();
    expect(await m.restartServer()).toBe(true);
    expect(requested[0]).toBe("/api/restart");
    expect(m.serverRestartPhase.value).toBe("restarting");
    expect(m.serverRestartRelaunches.value).toBe(true);
  });

  // The old server answers for the grace period after the click; reloading onto it would land the
  // page on a server that is about to go.
  it("does not reload while the old server still answers, and reloads once it is back", async () => {
    answers = [{ ok: true, body: { restarting: true, relaunch: false } }, { ok: true }, "down", "down", { ok: true }];
    const m = await load();
    await m.restartServer();
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).not.toHaveBeenCalled(); // still the old server
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).not.toHaveBeenCalled(); // gone
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("says it is slow after a few minutes, and keeps waiting", async () => {
    answers = [{ ok: true, body: { restarting: true, relaunch: true } }];
    const m = await load();
    await m.restartServer();
    await vi.advanceTimersByTimeAsync(3 * 60_000 + 2000);
    expect(m.serverRestartPhase.value).toBe("slow");
    answers = [{ ok: true }];
    await vi.advanceTimersByTimeAsync(1000);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("answers false and leaves no overlay when the request fails", async () => {
    answers = [{ ok: false }];
    const m = await load();
    expect(await m.restartServer()).toBe(false);
    expect(m.serverRestartPhase.value).toBe("idle");
  });

  it("asks once, however often it is pressed", async () => {
    answers = [{ ok: true, body: { restarting: true } }];
    const m = await load();
    await m.restartServer();
    await m.restartServer();
    expect(requested.filter((url) => url === "/api/restart")).toHaveLength(1);
  });
});
