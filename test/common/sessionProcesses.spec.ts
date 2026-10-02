// The Processes page's wire shape and what it highlights.
import { describe, it, expect } from "vitest";
import { HOT_CPU_PERCENT, LONG_RUNNING_SECONDS, isHot, isLongRunning, isPaneRoot, readProcessesBody, type SessionProcess } from "../../common/sessionProcesses";

const PROCESS: SessionProcess = { pid: 10, ppid: 1, depth: 1, command: "vite", rssKb: 1, elapsedSeconds: 1, startedAt: "s", cpuPercent: 0 };

describe("highlights", () => {
  it.each([
    [null, false],
    [HOT_CPU_PERCENT - 1, false],
    [HOT_CPU_PERCENT, true],
  ])("cpu %s is hot: %s", (cpuPercent, hot) => {
    expect(isHot({ ...PROCESS, cpuPercent })).toBe(hot);
  });

  it.each([
    [LONG_RUNNING_SECONDS - 1, false],
    [LONG_RUNNING_SECONDS, true],
  ])("elapsed %s is long-running: %s", (elapsedSeconds, long) => {
    expect(isLongRunning({ ...PROCESS, elapsedSeconds })).toBe(long);
  });

  it("calls only depth 0 the pane root", () => {
    expect(isPaneRoot({ ...PROCESS, depth: 0 })).toBe(true);
    expect(isPaneRoot(PROCESS)).toBe(false);
  });
});

describe("readProcessesBody", () => {
  const SESSION = { sessionId: "a", cwd: null, processes: [PROCESS, { ...PROCESS, cpuPercent: null }] };

  it("reads the sessions", () => {
    expect(readProcessesBody({ sessions: [SESSION] })).toEqual([SESSION]);
  });

  it("drops a session it cannot read, keeping the rest", () => {
    const broken = { ...SESSION, processes: [{ ...PROCESS, pid: "10" }] };
    expect(readProcessesBody({ sessions: [broken, { ...SESSION, sessionId: "b" }, 3] })).toEqual([{ ...SESSION, sessionId: "b" }]);
  });

  it.each([null, [], {}, { sessions: {} }])("is null for %j", (body) => {
    expect(readProcessesBody(body)).toBeNull();
  });
});
