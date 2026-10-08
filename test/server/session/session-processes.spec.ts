// @vitest-environment node
// The Processes page's model: which processes belong to which session, how busy each is, and which
// one a kill request may reach.
import { describe, it, expect } from "vitest";
import type { ProcessDetail } from "../../../server/infra/process-list";
import { buildSessionProcesses, cpuBaselineOf, killVerdict } from "../../../server/session/session-processes";

const row = (pid: number, ppid: number, extra: Partial<ProcessDetail> = {}): ProcessDetail => ({
  pid,
  ppid,
  cpuSeconds: 0,
  rssKb: 1024,
  elapsedSeconds: 60,
  startedAt: `start-${pid}`,
  command: `cmd-${pid}`,
  ...extra,
});

// launchd(1) -> shell 100 (pane of "a") -> node 110 -> vite 111, esbuild 112; shell 200 (pane of "b").
const ROWS = [row(1, 0), row(100, 1), row(110, 100), row(112, 110), row(111, 110), row(200, 1), row(300, 1)];
const PANES = new Map([
  ["b", [200]],
  ["a", [100]],
]);

const build = (rows: ProcessDetail[] = ROWS, extra: Partial<Parameters<typeof buildSessionProcesses>[0]> = {}) =>
  buildSessionProcesses({ rows, panePids: PANES, cwdOf: (id) => (id === "a" ? "/work/a" : null), baseline: null, atMs: 10_000, ...extra });

describe("buildSessionProcesses", () => {
  it("lists each session's tree, parents before children, sessions in id order", () => {
    const sessions = build();
    expect(sessions.map((session) => session.sessionId)).toEqual(["a", "b"]);
    expect(sessions[0]?.processes.map((process) => [process.pid, process.depth])).toEqual([
      [100, 0],
      [110, 1],
      [111, 2],
      [112, 2],
    ]);
    expect(sessions[1]?.processes.map((process) => process.pid)).toEqual([200]);
  });

  it("never lists a process outside a session's tree", () => {
    const pids = build().flatMap((session) => session.processes.map((process) => process.pid));
    expect(pids).not.toContain(300);
    expect(pids).not.toContain(1);
  });

  it("carries the remembered folder, or null", () => {
    expect(build().map((session) => session.cwd)).toEqual(["/work/a", null]);
  });

  it("leaves out a session whose pane process is already gone", () => {
    expect(build(ROWS.filter((r) => r.pid !== 200)).map((session) => session.sessionId)).toEqual(["a"]);
  });

  it("walks each pid once when the listing has a cycle", () => {
    const cyclic = [row(100, 111), row(110, 100), row(111, 110)];
    expect(buildSessionProcesses({ rows: cyclic, panePids: new Map([["a", [100]]]), cwdOf: () => null, baseline: null, atMs: 0 })[0]?.processes).toHaveLength(
      3,
    );
  });

  it("reports a split session's panes once each, without repeating a shared pid", () => {
    const sessions = buildSessionProcesses({ rows: ROWS, panePids: new Map([["a", [100, 110]]]), cwdOf: () => null, baseline: null, atMs: 0 });
    expect(sessions[0]?.processes.map((process) => process.pid)).toEqual([100, 110, 111, 112]);
  });
});

describe("CPU between reads", () => {
  const before = [row(100, 1, { cpuSeconds: 10 }), row(110, 100, { cpuSeconds: 4 })];
  const baseline = cpuBaselineOf(before, 8_000);

  it("is unknown without a baseline", () => {
    expect(build(before).flatMap((session) => session.processes.map((process) => process.cpuPercent))).toEqual([null, null]);
  });

  it("is the CPU time spent since the baseline, as a percent of one core", () => {
    const after = [row(100, 1, { cpuSeconds: 11 }), row(110, 100, { cpuSeconds: 4 })];
    const percents = build(after, { baseline, atMs: 10_000 })[0]?.processes.map((process) => process.cpuPercent);
    expect(percents).toEqual([50, 0]);
  });

  it("counts a process started since the baseline from zero, and a reused pid as new", () => {
    const after = [row(100, 1, { cpuSeconds: 10 }), row(110, 100, { cpuSeconds: 1, startedAt: "a later start" }), row(111, 110, { cpuSeconds: 0.5 })];
    const percents = build(after, { baseline, atMs: 10_000 })[0]?.processes.map((process) => process.cpuPercent);
    expect(percents).toEqual([0, 50, 25]);
  });

  it("never goes negative", () => {
    const after = [row(100, 1, { cpuSeconds: 9 })];
    expect(build(after, { baseline, atMs: 10_000 })[0]?.processes[0]?.cpuPercent).toBe(0);
  });

  it("is unknown when no time has passed", () => {
    expect(build(before, { baseline, atMs: 8_000 })[0]?.processes[0]?.cpuPercent).toBeNull();
  });
});

describe("killVerdict", () => {
  const sessions = build();

  it("allows a process under a session's pane", () => {
    expect(killVerdict(sessions, 111, "start-111")).toBe("kill");
  });

  it("refuses the pane's own process, which is the session", () => {
    expect(killVerdict(sessions, 100, "start-100")).toBe("pane-root");
  });

  it.each([
    ["a process outside every session", 300, "start-300"],
    ["a pid that now belongs to a different process", 111, "an earlier start"],
    ["a pid that is not running", 999, "start-999"],
  ])("refuses %s", (_name, pid, startedAt) => {
    expect(killVerdict(sessions, pid, startedAt)).toBe("gone");
  });
});
