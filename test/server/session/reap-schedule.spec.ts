// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sweepIdleSessions = vi.fn(() => ({ reaped: ["mt-gone"], heldBack: 0, recent: 0, unclear: 0 }));
const reapSweepLines = vi.fn(() => ["[tmux] swept"]);

vi.mock("../../../server/session/reap-idle-sessions.js", () => ({
  sweepIdleSessions: (...a: unknown[]) => sweepIdleSessions(...(a as [])),
  reapSweepLines: (...a: unknown[]) => reapSweepLines(...(a as [])),
}));

const { startReapSchedule } = await import("../../../server/session/reap-schedule.js");

describe("startReapSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sweepIdleSessions.mockClear();
    reapSweepLines.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const schedule = (intervalHours: number, log: (line: string) => void = () => {}) => ({ intervalHours, idleDays: () => 7, log });

  it("sweeps once at boot and answers with what it ended", () => {
    const reaped = startReapSchedule(schedule(0));
    expect(sweepIdleSessions).toHaveBeenCalledTimes(1);
    expect(reaped).toEqual(["mt-gone"]);
  });

  // Off is the default, so this is the behaviour an untouched config must keep.
  it("arms nothing when the interval is off", () => {
    startReapSchedule(schedule(0));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(sweepIdleSessions).toHaveBeenCalledTimes(1); // the boot sweep, and no more
  });

  it("sweeps again on each interval once armed", () => {
    startReapSchedule(schedule(6));
    expect(sweepIdleSessions).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(sweepIdleSessions).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(sweepIdleSessions).toHaveBeenCalledTimes(3);
  });

  it("says on the log that the sweep will repeat", () => {
    const lines: string[] = [];
    startReapSchedule(schedule(6, (line) => lines.push(line)));
    expect(lines.some((l) => l.includes("repeats every 6h"))).toBe(true);
  });

  // The threshold is live config: a POST between ticks must be what the next sweep uses.
  it("re-reads the idle threshold at every tick", () => {
    let days = 7;
    startReapSchedule({ intervalHours: 1, idleDays: () => days, log: () => {} });
    days = 2;
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(sweepIdleSessions).toHaveBeenLastCalledWith(expect.any(Number), 2);
  });
});
