// @vitest-environment node
// A session's CPU is its whole process tree's, and only what was spent BETWEEN the two listings —
// a process that just appeared, or a pid the kernel reused, must not bill the session for a
// lifetime it did not spend here.
import { describe, it, expect } from "vitest";
import { processTree, sessionCpuPercent } from "../../../server/session/session-cpu";
import type { ProcessRow } from "../../../server/infra/process-list";

const row = (pid: number, ppid: number, cpuSeconds: number): ProcessRow => ({ pid, ppid, cpuSeconds });

describe("processTree", () => {
  const children = new Map([
    [10, [11, 12]],
    [11, [13]],
    [20, [21]],
  ]);

  it("is the root and everything below it, however deep", () => {
    expect(processTree(10, children).sort((a, b) => a - b)).toEqual([10, 11, 12, 13]);
  });

  it("does not reach into another tree", () => {
    expect(processTree(20, children).sort((a, b) => a - b)).toEqual([20, 21]);
  });

  it("is only the root for a process with no children", () => {
    expect(processTree(13, children)).toEqual([13]);
  });

  it("ends on a cycle rather than spinning", () => {
    expect(
      processTree(
        1,
        new Map([
          [1, [2]],
          [2, [1]],
        ]),
      ).sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });
});

describe("sessionCpuPercent", () => {
  const panes = new Map([
    ["a", [100]],
    ["b", [200]],
  ]);

  it("sums the time each tree spent over the interval, as percent of one core", () => {
    const before = [row(100, 1, 10), row(101, 100, 5), row(200, 1, 0)];
    const after = [row(100, 1, 11), row(101, 100, 9), row(200, 1, 0.5)];
    const usage = sessionCpuPercent(before, after, panes, 5);
    expect(usage.get("a")).toBeCloseTo(100);
    expect(usage.get("b")).toBeCloseTo(10);
  });

  it("counts a process that appeared during the interval from zero", () => {
    const usage = sessionCpuPercent([row(100, 1, 0)], [row(100, 1, 0), row(102, 100, 500)], panes, 5);
    expect(usage.get("a")).toBe(0);
  });

  it("counts a pid whose time went down (reused) from zero", () => {
    const usage = sessionCpuPercent([row(100, 1, 0), row(103, 100, 50)], [row(100, 1, 0), row(103, 100, 2)], panes, 5);
    expect(usage.get("a")).toBe(0);
  });

  it("does not bill a session for a process outside its tree", () => {
    const usage = sessionCpuPercent([row(100, 1, 0), row(300, 1, 0)], [row(100, 1, 0), row(300, 1, 100)], panes, 5);
    expect(usage.get("a")).toBe(0);
  });

  it("reports zero for a pane whose process has gone", () => {
    const usage = sessionCpuPercent([row(100, 1, 1)], [], panes, 5);
    expect(usage.get("a")).toBe(0);
  });

  it("reports nothing when no time passed", () => {
    expect(sessionCpuPercent([row(100, 1, 0)], [row(100, 1, 1)], panes, 0).size).toBe(0);
  });
});

describe("sessionCpuPercent — a process that exited between the listings", () => {
  it("contributes nothing, even though it was part of the tree before", () => {
    const panes = new Map([["a", [100]]]);
    const before = [row(100, 1, 0), row(104, 100, 10)];
    const after = [row(100, 1, 0)];
    expect(sessionCpuPercent(before, after, panes, 5).get("a")).toBe(0);
  });
});

describe("sessionCpuPercent — a session split into several panes", () => {
  it("adds every pane's tree", () => {
    const panes = new Map([["a", [100, 200]]]);
    const usage = sessionCpuPercent([row(100, 1, 0), row(200, 1, 0)], [row(100, 1, 2.5), row(200, 1, 2.5)], panes, 5);
    expect(usage.get("a")).toBeCloseTo(100);
  });

  it("counts a process reached from two panes once", () => {
    const panes = new Map([["a", [100, 100]]]);
    const usage = sessionCpuPercent([row(100, 1, 0)], [row(100, 1, 5)], panes, 5);
    expect(usage.get("a")).toBeCloseTo(100);
  });
});
