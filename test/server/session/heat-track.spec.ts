// @vitest-environment node
// The rules that decide what a session shows. A level is earned by an AVERAGE held over its own
// window, so a spike lights nothing and a dip puts nothing out; the finale is earned by a hot run
// that then calms, plays once, and has to be earned again.
import { describe, it, expect } from "vitest";
import { averageOver, emptyHeatTrack, heatLevelOf, nextHeat, type CpuSample, type HeatTrack } from "../../../server/session/heat-track";
import type { HeatLevel } from "../../../common/playfulEffects";

const STEP_MS = 5000;
const SECOND_MS = 1000;

/** Feed `seconds` of samples at `percent`, starting where the track's last sample ended. */
type Outcome = { level: HeatLevel; finale: boolean };
const NO_OUTCOMES: Outcome[] = [];

function run(state: { track: HeatTrack; nowMs: number }, percent: number, seconds: number) {
  const steps = Array.from({ length: (seconds * SECOND_MS) / STEP_MS }, (_, index) => state.nowMs + index * STEP_MS);
  const walked = steps.reduce(
    (acc, fromMs) => {
      const result = nextHeat(acc.track, { fromMs, toMs: fromMs + STEP_MS, percent });
      return { track: result.track, outcomes: [...acc.outcomes, { level: result.level, finale: result.finale }] };
    },
    { track: state.track, outcomes: NO_OUTCOMES },
  );
  const nowMs = state.nowMs + steps.length * STEP_MS;
  return { track: walked.track, nowMs, outcomes: walked.outcomes, last: walked.outcomes[walked.outcomes.length - 1] };
}

const fresh = () => ({ track: emptyHeatTrack(), nowMs: 0 });

describe("averageOver", () => {
  const samples: CpuSample[] = [
    { fromMs: 0, toMs: 5000, percent: 100 },
    { fromMs: 5000, toMs: 10000, percent: 300 },
  ];

  it("weights each sample by how much of the window it covers", () => {
    expect(averageOver(samples, 10000, 10000)).toBe(200);
    expect(averageOver(samples, 10000, 5000)).toBe(300);
    expect(averageOver(samples, 10000, 7500)).toBeCloseTo((100 * 2500 + 300 * 5000) / 7500);
  });

  it("is null while the history does not reach back over the whole window", () => {
    expect(averageOver(samples, 10000, 20000)).toBeNull();
    expect(averageOver([], 10000, 5000)).toBeNull();
  });
});

describe("heatLevelOf", () => {
  it("is nothing without history", () => {
    expect(heatLevelOf([], 0)).toBe(0);
  });
});

describe("nextHeat — levels", () => {
  it("lights nothing on a short spike", () => {
    expect(run(fresh(), 400, 20).last?.level).toBe(0);
  });

  it("climbs through the levels as a heavy run is held", () => {
    const outcomes = run(fresh(), 250, 200).outcomes.map((outcome) => outcome.level);
    expect(outcomes[4]).toBe(0);
    expect(outcomes).toContain(1);
    expect(outcomes).toContain(2);
    expect(outcomes).toContain(3);
    expect(outcomes[outcomes.length - 1]).toBe(4);
    const firstOf = (level: HeatLevel) => outcomes.indexOf(level);
    expect(firstOf(1)).toBeLessThan(firstOf(2));
    expect(firstOf(2)).toBeLessThan(firstOf(3));
    expect(firstOf(3)).toBeLessThan(firstOf(4));
  });

  it("stops at the level the load can hold", () => {
    expect(run(fresh(), 120, 300).last?.level).toBe(2);
    expect(run(fresh(), 90, 300).last?.level).toBe(1);
    expect(run(fresh(), 60, 300).last?.level).toBe(0);
  });

  it("does not drop a level for one quiet sample", () => {
    const hot = run(fresh(), 250, 200);
    const dip = run(hot, 0, 5);
    expect(dip.last?.level).toBe(4);
  });
});

describe("nextHeat — the finale", () => {
  it("plays once when a hot run calms, then starts over from nothing", () => {
    const hot = run(fresh(), 250, 200);
    const calm = run(hot, 0, 30);
    const finales = calm.outcomes.filter((outcome) => outcome.finale);
    expect(finales).toHaveLength(1);
    expect(calm.last).toEqual({ level: 0, finale: false });
    expect(calm.track).toEqual({ samples: expect.any(Array), peak: 0 });
  });

  it("is not earned by a run that never got hot enough", () => {
    const warm = run(fresh(), 120, 200);
    expect(run(warm, 0, 60).outcomes.some((outcome) => outcome.finale)).toBe(false);
  });

  it("waits for the run to really calm down, not merely ease off", () => {
    const hot = run(fresh(), 250, 200);
    expect(run(hot, 70, 60).outcomes.some((outcome) => outcome.finale)).toBe(false);
  });

  it("has to be earned again after it plays", () => {
    const first = run(run(fresh(), 250, 200), 0, 30);
    const shortSecond = run(first, 250, 30);
    expect(run(shortSecond, 0, 30).outcomes.some((outcome) => outcome.finale)).toBe(false);
  });

  it("forgets a warm run that cooled, so a later hot run is judged on its own", () => {
    const warm = run(fresh(), 120, 100);
    const cooled = run(warm, 0, 60);
    expect(cooled.track.peak).toBe(0);
  });
});
