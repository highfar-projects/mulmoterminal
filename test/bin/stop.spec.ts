// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { stopInstances, stopReport, stopExitCode, describeInstance } from "../../bin/stop.js";

const instance = (pid: number, port: number | null = 34567) => ({ pid, port, startedAt: 1 });

// The effects are injected, so a whole stop can be observed without a process to kill. `alive` is
// the world: a pid in the set is running, and a kill that "works" takes it out.
const world = (alive: number[], kill?: (pid: number) => void) => {
  const running = new Set(alive);
  return {
    running,
    effects: {
      kill: kill ?? ((pid: number) => running.delete(pid)),
      isAlive: (pid: number) => running.has(pid),
      sleep: async () => {},
      graceMs: 300,
    },
  };
};

const refuse = (code: string) => (pid: number) => {
  const err: NodeJS.ErrnoException = new Error(`kill ${pid}`);
  err.code = code;
  throw err;
};

describe("stopInstances", () => {
  it("stops every running server, not just the first", async () => {
    const { effects } = world([11, 22]);
    const result = await stopInstances([instance(11, 34567), instance(22, 34568)], effects);
    expect(result.stopped.map((i) => i.pid)).toEqual([11, 22]);
    expect(result.stubborn).toEqual([]);
  });

  it("treats a server that ended on its own as nothing to report", async () => {
    // ESRCH is the registry being a moment stale — the user asked for it to be stopped and it is.
    const { effects } = world([], refuse("ESRCH"));
    const result = await stopInstances([instance(11)], effects);
    expect(result.stopped).toEqual([]);
    expect(result.stubborn).toEqual([]);
  });

  it("reports a server it is not allowed to stop, rather than claiming success", async () => {
    const { effects } = world([11], refuse("EPERM"));
    const result = await stopInstances([instance(11)], effects);
    expect(result.stopped).toEqual([]);
    expect(result.stubborn).toEqual([{ pid: 11, port: 34567, startedAt: 1, reason: "EPERM" }]);
  });

  it("gives up on a server that outlives the grace period, and says which", async () => {
    const { effects } = world([11]);
    const result = await stopInstances([instance(11)], { ...effects, kill: () => {} });
    expect(result.stopped).toEqual([]);
    expect(result.stubborn.map((i) => i.reason)).toEqual(["still running"]);
  });

  it("waits for a slow shutdown instead of calling it stubborn", async () => {
    // The window exists because SIGTERM runs the same shutdown Ctrl+C runs, which is not instant.
    const { running, effects } = world([11]);
    let polls = 0;
    const result = await stopInstances([instance(11)], {
      ...effects,
      kill: () => {},
      isAlive: (pid: number) => {
        if (++polls > 2) running.delete(pid);
        return running.has(pid);
      },
    });
    expect(result.stopped.map((i) => i.pid)).toEqual([11]);
  });

  it("asks them all before waiting on any, so one slow server does not delay the rest", async () => {
    const order: string[] = [];
    const { effects } = world([11, 22]);
    await stopInstances([instance(11), instance(22)], {
      ...effects,
      kill: (pid: number) => order.push(`kill:${pid}`),
      isAlive: () => {
        order.push("poll");
        return false;
      },
    });
    expect(order.indexOf("kill:22")).toBeLessThan(order.indexOf("poll"));
  });

  it("sends SIGTERM by default — the signal the server has a handler for", async () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    await stopInstances([instance(11)], { isAlive: () => false, sleep: async () => {}, graceMs: 0 });
    expect(kill).toHaveBeenCalledWith(11, "SIGTERM");
    kill.mockRestore();
  });
});

describe("stopReport", () => {
  it("says so plainly when nothing was running", () => {
    expect(stopReport({ stopped: [], stubborn: [] })).toEqual(["MulmoTerminal is not running."]);
  });

  it("names each server by the URL the user has open", () => {
    expect(stopReport({ stopped: [instance(11, 34567)], stubborn: [] })).toEqual(["Stopped http://localhost:34567 (pid 11)"]);
  });

  it("hands over the pid when it could not stop one, because the registry is no longer readable to the user", () => {
    const lines = stopReport({ stopped: [], stubborn: [{ ...instance(11), reason: "EPERM" }] });
    expect(lines.join("\n")).toContain("Could NOT stop");
    expect(lines.join("\n")).toContain("kill -9 11");
  });

  it("falls back to the pid for an instance that never recorded a port", () => {
    expect(describeInstance(instance(11, null))).toBe("pid 11");
  });
});

describe("stopExitCode", () => {
  it("succeeds when there was nothing to stop, so a script can run it before starting", () => {
    expect(stopExitCode({ stopped: [], stubborn: [] })).toBe(0);
  });

  it("fails only when something was asked to stop and did not", () => {
    expect(stopExitCode({ stopped: [instance(11)], stubborn: [] })).toBe(0);
    expect(stopExitCode({ stopped: [], stubborn: [{ ...instance(11), reason: "EPERM" }] })).toBe(1);
  });
});
