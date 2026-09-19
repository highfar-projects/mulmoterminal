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

// Harvested from the throwaway differential that proved the boot block's move (#2165): the old
// inline version in server/index.ts is gone, so what survives is the GENERATOR (which sweep
// shapes, thresholds and log outputs matter) and the PROPERTY the old block had — the boot half
// returns the sweep's reaped list verbatim, logs exactly what reapSweepLines produced, and asks
// the sweep with the threshold read at that moment.
const SWEEP_SHAPES = [
  { reaped: [], heldBack: 0, recent: 0, unclear: 0 },
  { reaped: ["mt-a"], heldBack: 0, recent: 0, unclear: 0 },
  { reaped: ["mt-a", "mt-b", "mt-c"], heldBack: 2, recent: 5, unclear: 1 },
  { reaped: [], heldBack: 9, recent: 0, unclear: 3 },
];
const THRESHOLDS = [0, 1, 7, 30, 365];
const LOG_OUTPUTS = [[], ["[tmux] one"], ["[tmux] one", "[tmux] two"]];
/** The generator, flattened: the cross product is the input set, one case per row. */
const BOOT_CASES = SWEEP_SHAPES.flatMap((shape) => THRESHOLDS.flatMap((days) => LOG_OUTPUTS.map((lines) => ({ shape, days, lines }))));

describe("startReapSchedule — the boot half, over every shape a sweep can answer with", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sweepIdleSessions.mockReset();
    reapSweepLines.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("returns the reaped list, logs the sweep lines, and passes the live threshold", () => {
    BOOT_CASES.forEach(({ shape, days, lines }) => {
      sweepIdleSessions.mockReturnValue(shape);
      reapSweepLines.mockReturnValue(lines);
      const logged: string[] = [];
      const reaped = startReapSchedule({ intervalHours: 0, idleDays: () => days, log: (l) => logged.push(l) });

      expect(reaped).toEqual(shape.reaped);
      expect(logged).toEqual(lines);
      expect(sweepIdleSessions).toHaveBeenLastCalledWith(expect.any(Number), days);
      expect(reapSweepLines).toHaveBeenLastCalledWith(shape, days);

      sweepIdleSessions.mockReset();
      reapSweepLines.mockReset();
    });
    expect(BOOT_CASES).toHaveLength(SWEEP_SHAPES.length * THRESHOLDS.length * LOG_OUTPUTS.length);
  });
});
