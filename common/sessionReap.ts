// How long a session may sit untouched before the server ends it on its own (#1467).
//
// tmux persistence means a terminal survives a restart, which is the feature — and also why they
// pile up: nothing ever ended one. What makes ending safe is not that the conversation is
// disposable (it is on disk, and resumes without the tmux session) but that nothing is USING it:
// no terminal attached, and no output for this long.
//
// In `common/` because both sides decide from it: the server sweeps at boot, and the Settings
// stepper writes the number and shows which rows it will reach.

/** A week: past any weekend or holiday someone might leave an agent waiting through. */
export const DEFAULT_REAP_IDLE_DAYS = 7;
/** Zero is not "immediately" — it is OFF, and the only way to turn the sweep off. */
export const REAP_IDLE_DAYS_OFF = 0;
export const MIN_REAP_IDLE_DAYS = REAP_IDLE_DAYS_OFF;
// A year. Not a limit anyone will reach — it exists so a typo of `70000` reads as "off-ish" rather
// than as a number the UI has to render.
export const MAX_REAP_IDLE_DAYS = 365;

const SECONDS_PER_DAY = 24 * 60 * 60;

export const reapIdleSeconds = (days: number): number => days * SECONDS_PER_DAY;

/**
 * Whole days within range; anything else falls back to the default.
 *
 * Deliberately NOT "0 on junk": a corrupt value silently disabling the sweep is the failure that
 * looks exactly like the bug this fixes, and nobody would find it.
 */
export function sanitizeReapIdleDays(value: unknown): number {
  // Whole days ONLY, and rounding is not the same thing: `Math.round(0.4)` is 0, which is the off
  // switch — so a fractional value would disable the sweep entirely, the exact silent-disable this
  // function's fallback exists to prevent (CodeRabbit on #1486).
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_REAP_IDLE_DAYS;
  if (value < MIN_REAP_IDLE_DAYS || value > MAX_REAP_IDLE_DAYS) return DEFAULT_REAP_IDLE_DAYS;
  return value;
}

export const reapSweepEnabled = (days: number): boolean => days > REAP_IDLE_DAYS_OFF;

// How often the sweep runs again while the server is up (#2165).
//
// The boot sweep is the strong one: at startup none of OUR ptys hold anything, so nothing is
// held back by `liveHere`. A timer sweep is necessarily WEAKER — it cannot touch a session this
// server is holding a pty for. What it does reach is the class that accumulates during a long
// run: the server let the pty go, no terminal is attached, and nothing has written for days.
//
// OFF by default, unlike the idle threshold. Ending a session is not something a running server
// should start doing because someone upgraded; it waits to be asked.
export const DEFAULT_REAP_INTERVAL_HOURS = 0;
export const REAP_INTERVAL_HOURS_OFF = 0;
export const MIN_REAP_INTERVAL_HOURS = REAP_INTERVAL_HOURS_OFF;
/** A week. Past this the next restart arrives first, so a larger number says "off" less clearly. */
export const MAX_REAP_INTERVAL_HOURS = 168;

const MS_PER_HOUR = 60 * 60 * 1000;

export const reapIntervalMs = (hours: number): number => hours * MS_PER_HOUR;

/**
 * Whole hours within range; anything else falls back to the default.
 *
 * The default here is OFF, so unlike `sanitizeReapIdleDays` a junk value cannot silently
 * ENABLE anything — the failure this one has to avoid is the opposite, and falling back to
 * the default is already the safe side.
 */
export function sanitizeReapIntervalHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_REAP_INTERVAL_HOURS;
  if (value < MIN_REAP_INTERVAL_HOURS || value > MAX_REAP_INTERVAL_HOURS) return DEFAULT_REAP_INTERVAL_HOURS;
  return value;
}

export const reapTimerEnabled = (hours: number): boolean => hours > REAP_INTERVAL_HOURS_OFF;
