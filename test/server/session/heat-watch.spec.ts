// @vitest-environment node
// The watcher's promises: nothing is measured while nobody watches or the setting is off, a
// browser hears only when its session's level CHANGES (plus each finale), a new socket is told
// the current state, and a session tmux no longer lists takes its history with it.
import { describe, it, expect, vi } from "vitest";
import { createHeatWatch, type HeatWatchDeps } from "../../../server/session/heat-watch";
import type { ProcessRow } from "../../../server/infra/process-list";

const STEP_MS = 5000;
const STEP_SECONDS = 5;

function harness(options: { enabled?: boolean; percent?: () => number } = {}) {
  const clock = { nowMs: 0 };
  const cpu = { seconds: 0 };
  const socketA = {};
  const connected = new Map<string, object>([["a", socketA]]);
  const panes = new Map<string, number[]>([["a", [100]]]);
  const state = { enabled: options.enabled ?? true };
  const percent = options.percent ?? (() => 250);
  const published: { id: string; level: number; finale: boolean }[] = [];
  const listProcesses = vi.fn(async (): Promise<ProcessRow[]> => [{ pid: 100, ppid: 1, cpuSeconds: cpu.seconds }]);
  const deps: HeatWatchDeps = {
    enabled: () => state.enabled,
    connectedSessions: () => connected,
    listProcesses,
    listPanePids: async () => panes,
    publish: (id, level, finale) => published.push({ id, level, finale }),
    now: () => clock.nowMs,
  };
  const watch = createHeatWatch(deps);
  /** Advance one interval with the process burning `percent` of a core, then tick. */
  const step = async (): Promise<void> => {
    clock.nowMs += STEP_MS;
    cpu.seconds += (percent() / 100) * STEP_SECONDS;
    await watch.tick();
  };
  const steps = async (count: number): Promise<void> => {
    await Array.from({ length: count }).reduce<Promise<void>>(async (previous) => {
      await previous;
      await step();
    }, Promise.resolve());
  };
  return { watch, step, steps, state, connected, panes, published, listProcesses, socketA };
}

describe("heat watch", () => {
  it("does not run ps while the setting is off", async () => {
    const h = harness({ enabled: false });
    await h.steps(3);
    expect(h.listProcesses).not.toHaveBeenCalled();
  });

  it("does not run ps while no browser is attached", async () => {
    const h = harness();
    h.connected.clear();
    await h.steps(3);
    expect(h.listProcesses).not.toHaveBeenCalled();
  });

  it("takes a baseline first and reports nothing from it", async () => {
    const h = harness();
    await h.watch.tick();
    expect(h.published).toEqual([]);
  });

  it("tells the browser only when the level changes", async () => {
    const h = harness();
    await h.watch.tick();
    await h.steps(50);
    const levels = h.published.map((entry) => entry.level);
    expect(levels[0]).toBe(0);
    expect(levels).toEqual([...new Set(levels)]);
    expect(levels[levels.length - 1]).toBe(4);
  });

  it("tells a new socket the current level even when it has not changed", async () => {
    const h = harness();
    await h.watch.tick();
    await h.steps(50);
    const before = h.published.length;
    h.connected.set("a", {});
    await h.step();
    expect(h.published).toHaveLength(before + 1);
    expect(h.published[h.published.length - 1]).toEqual({ id: "a", level: 4, finale: false });
  });

  it("sends the finale when a hot run calms", async () => {
    const load = { percent: 250 };
    const h = harness({ percent: () => load.percent });
    await h.watch.tick();
    await h.steps(50);
    load.percent = 0;
    await h.steps(6);
    expect(h.published.filter((entry) => entry.finale)).toEqual([{ id: "a", level: 0, finale: true }]);
  });

  it("starts from a fresh listing after a pause, rather than billing the pause", async () => {
    const h = harness();
    await h.watch.tick();
    h.state.enabled = false;
    await h.steps(40);
    h.state.enabled = true;
    await h.step();
    expect(h.published).toEqual([]);
  });

  it("forgets a session tmux no longer lists", async () => {
    const h = harness();
    await h.watch.tick();
    await h.step();
    expect(h.watch.trackedSessionCount()).toBe(1);
    h.panes.clear();
    await h.step();
    expect(h.watch.trackedSessionCount()).toBe(0);
  });

  it("does not run two measurements at once", async () => {
    const h = harness();
    await Promise.all([h.watch.tick(), h.watch.tick()]);
    expect(h.listProcesses).toHaveBeenCalledTimes(1);
  });

  it("does not play a finale for a run that ended while no browser watched", async () => {
    const load = { percent: 250 };
    const h = harness({ percent: () => load.percent });
    const other = {};
    h.connected.set("b", other);
    h.panes.set("b", [200]);
    await h.watch.tick();
    await h.steps(50);
    h.connected.delete("a");
    load.percent = 0;
    await h.steps(40);
    h.connected.set("a", {});
    await h.steps(10);
    expect(h.published.filter((entry) => entry.id === "a" && entry.finale)).toEqual([]);
  });

  it("forgets every history over a pause", async () => {
    const h = harness();
    await h.watch.tick();
    await h.step();
    expect(h.watch.trackedSessionCount()).toBe(1);
    h.state.enabled = false;
    await h.step();
    expect(h.watch.trackedSessionCount()).toBe(0);
  });
});
