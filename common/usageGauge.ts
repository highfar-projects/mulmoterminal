// The usage gauge's two settings (#3153). Both sides decide from them — the server sanitizes what the
// config file says and gates its probe on it, the browser hydrates the toolbar and the Settings
// stepper — so a default or a bound that disagreed across the two would show a control that does not
// match what the server does.

/** ON unless the config says otherwise: the gauge is what most users open the grid to see. */
export const USAGE_GAUGE_DEFAULT = true;

export const sanitizeUsageGauge = (input: unknown): boolean => (typeof input === "boolean" ? input : USAGE_GAUGE_DEFAULT);

// How old Claude's reading may be before a probe is spent on a new one, in minutes.
export const DEFAULT_USAGE_PROBE_INTERVAL_MINUTES = 10;
// The browser asks every two minutes, so a shorter interval would not measure any more often.
export const MIN_USAGE_PROBE_INTERVAL_MINUTES = 2;
// The gauge stops drawing a reading an hour old (CLAUDE_READING_MAX_AGE_MS), so a longer interval
// would leave the Claude half blank between probes.
export const MAX_USAGE_PROBE_INTERVAL_MINUTES = 60;

/** Whole minutes, clamped to [MIN, MAX]. Anything that is not a positive number is the default. */
export function sanitizeUsageProbeIntervalMinutes(input: unknown): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) return DEFAULT_USAGE_PROBE_INTERVAL_MINUTES;
  return Math.min(MAX_USAGE_PROBE_INTERVAL_MINUTES, Math.max(MIN_USAGE_PROBE_INTERVAL_MINUTES, Math.round(input)));
}
