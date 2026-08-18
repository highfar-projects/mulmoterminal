import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMachineLoad } from "../../../src/composables/useMachineLoad";

// The gauge's guarantees are all in this file's timing, not in its parsing: one chain however many
// headers are mounted, nothing polling once they are gone, and a figure that is held through a
// blip but not past the point where it stops describing the machine. Codex asked for these on
// #1791, and none of them is visible from the pure specs beside this one.
describe("useMachineLoad polling lifecycle", () => {
  const fetchMock = vi.fn();
  const READING = { avg1: 8, avg5: 7, avg15: 6, cores: 4 };

  const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  const failing = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(() => ok({ load: READING }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Leaves a known reading on screen, the way a first successful poll would. */
  const started = async () => {
    const watcher = useMachineLoad();
    watcher.start();
    await vi.advanceTimersByTimeAsync(0);
    return watcher;
  };

  it("polls once for one watcher and shows what came back", async () => {
    const { load, stop } = await started();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(load.value).toEqual(READING);
    stop();
  });

  // Two headers mounted at once share one chain — the grid and a zoomed view would otherwise ask
  // about the same machine twice.
  it("does not start a second chain for a second watcher", async () => {
    const a = useMachineLoad();
    const b = useMachineLoad();
    a.start();
    b.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    a.stop();
    b.stop();
  });

  it("stops polling once the last watcher leaves", async () => {
    const { stop } = await started();
    stop();
    fetchMock.mockClear();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps polling on its own interval while a watcher stays", async () => {
    const { stop } = await started();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    stop();
  });

  // A blip must not blank a figure that was true a moment ago.
  it("holds the last reading through a failure", async () => {
    const { load, stop } = await started();
    fetchMock.mockImplementation(failing);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load.value).toEqual(READING);
    stop();
  });

  // Past the stale window it stops being a held reading and becomes a wrong one: load is a number
  // about NOW.
  it("drops the reading once the failures outlast the stale window", async () => {
    const { load, stop } = await started();
    fetchMock.mockImplementation(failing);
    await vi.advanceTimersByTimeAsync(70_000);
    expect(load.value).toBeNull();
    stop();
  });

  // The same rule for a body that cannot be read: it says nothing about the machine, so it is a
  // failure and not an answer.
  it("treats an unreadable body as a failure rather than as no load", async () => {
    const { load, stop } = await started();
    fetchMock.mockImplementation(() => ok({ load: { avg1: "many" } }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load.value).toEqual(READING);
    stop();
  });

  // The one null that IS an answer: this host keeps no load average, so the gauge must go at once
  // rather than hold what it had.
  it("clears at once when the host reports no load average", async () => {
    const { load, stop } = await started();
    fetchMock.mockImplementation(() => ok({ load: null }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load.value).toBeNull();
    stop();
  });
});
