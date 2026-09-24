// How hot a session has been running, decided from its recent CPU samples. Pure: time is the
// sample's own timestamps, so every rule is testable without waiting minutes for a busy machine.
//
// Each level asks for an AVERAGE over its own window, so a short spike does not light anything and
// a short dip does not put it out. A run that got hot (level 3 or more) and then calms down ends
// with the finale, once; the history is then cleared so the picture has to be earned again.
import type { HeatLevel } from "../../common/playfulEffects.js";

export interface CpuSample {
  fromMs: number;
  toMs: number;
  /** Percent of one core, summed over the session's process tree. */
  percent: number;
}

export interface HeatTrack {
  samples: CpuSample[];
  /** The highest level this run has reached, which is what earns the finale. */
  peak: HeatLevel;
}

interface HeatRule {
  level: HeatLevel;
  percent: number;
  windowMs: number;
}

const SECOND_MS = 1000;
const HEAT_RULES: readonly HeatRule[] = [
  { level: 4, percent: 200, windowMs: 180 * SECOND_MS },
  { level: 3, percent: 150, windowMs: 120 * SECOND_MS },
  { level: 2, percent: 100, windowMs: 60 * SECOND_MS },
  { level: 1, percent: 80, windowMs: 30 * SECOND_MS },
];
const LONGEST_WINDOW_MS = Math.max(...HEAT_RULES.map((rule) => rule.windowMs));
const FINALE_PEAK: HeatLevel = 3;
const CALM_PERCENT = 50;
const CALM_WINDOW_MS = 15 * SECOND_MS;

export const emptyHeatTrack = (): HeatTrack => ({ samples: [], peak: 0 });

/** The time-weighted average over the last `windowMs`, or null when the history does not reach that far back. */
export function averageOver(samples: readonly CpuSample[], nowMs: number, windowMs: number): number | null {
  const start = nowMs - windowMs;
  const inWindow = samples.filter((sample) => sample.toMs > start);
  const earliest = inWindow[0];
  if (!earliest || earliest.fromMs > start) return null;
  const weighted = inWindow.reduce(
    (sums, sample) => {
      const duration = sample.toMs - Math.max(sample.fromMs, start);
      return { cpu: sums.cpu + sample.percent * duration, duration: sums.duration + duration };
    },
    { cpu: 0, duration: 0 },
  );
  return weighted.duration > 0 ? weighted.cpu / weighted.duration : null;
}

export function heatLevelOf(samples: readonly CpuSample[], nowMs: number): HeatLevel {
  const met = HEAT_RULES.find((rule) => (averageOver(samples, nowMs, rule.windowMs) ?? 0) >= rule.percent);
  return met?.level ?? 0;
}

/** Add a sample and say what to show now. */
export function nextHeat(track: HeatTrack, sample: CpuSample): { track: HeatTrack; level: HeatLevel; finale: boolean } {
  const samples = [...track.samples, sample].filter((kept) => kept.toMs > sample.toMs - LONGEST_WINDOW_MS);
  const level = heatLevelOf(samples, sample.toMs);
  const calm = averageOver(samples, sample.toMs, CALM_WINDOW_MS);
  if (track.peak >= FINALE_PEAK && calm !== null && calm < CALM_PERCENT) {
    return { track: emptyHeatTrack(), level: 0, finale: true };
  }
  // A run that never got hot enough for the finale is over once it is cold again.
  const runPeak = level === 0 && track.peak < FINALE_PEAK ? 0 : track.peak;
  const peak = level > runPeak ? level : runPeak;
  return { track: { samples, peak }, level, finale: false };
}
