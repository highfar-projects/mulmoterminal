// The token usage screen's rows (#2919): what each rotation token has LEFT of its 5h and 7d windows.
// Pure — the readings and the clock come in.
import type { RateLimitWindow } from "../../common/rateLimits";
import type { AccountReading } from "./rateLimitGauge";

const FULL_PERCENT = 100;
const MS_PER_SEC = 1000;

/** Why a row has no figures, or that it has them. */
export type TokenUsageState = "ok" | "measuring" | "at-limit" | "no-answer";

export interface TokenUsageWindow {
  /** What is left, 0-100, rounded down; null when the window was not reported. */
  leftPercent: number | null;
  /** Unix seconds, or null when unknown or already past. */
  resetsAt_sec: number | null;
}

export interface TokenUsageRow {
  id: string;
  label: string;
  email: string | null;
  fiveHour: TokenUsageWindow;
  sevenDay: TokenUsageWindow;
  state: TokenUsageState;
}

/** A window as what is left of it. One whose reset has passed holds nothing back. */
export function windowLeft(window: RateLimitWindow | null, now_ms: number): TokenUsageWindow {
  if (!window) return { leftPercent: null, resetsAt_sec: null };
  const reset = window.resetsAt_sec;
  if (reset !== null && reset * MS_PER_SEC <= now_ms) return { leftPercent: FULL_PERCENT, resetsAt_sec: null };
  const left = Math.floor(FULL_PERCENT - window.usedPercentage);
  return { leftPercent: Math.min(FULL_PERCENT, Math.max(0, left)), resetsAt_sec: reset };
}

function stateOf(reading: AccountReading): TokenUsageState {
  if (reading.limits) return "ok";
  if (reading.probe === "no-report" && reading.probeStall === "usage-limit") return "at-limit";
  return reading.probe === "no-report" ? "no-answer" : "measuring";
}

/** One row per rotation token, in config order; accounts are not this screen's business. */
export function tokenUsageRows(readings: readonly AccountReading[], now_ms: number): TokenUsageRow[] {
  return readings
    .filter((reading) => reading.rotation === true)
    .map((reading) => ({
      id: reading.id,
      label: reading.label,
      email: reading.email ?? null,
      fiveHour: windowLeft(reading.limits?.fiveHour ?? null, now_ms),
      sevenDay: windowLeft(reading.limits?.sevenDay ?? null, now_ms),
      state: stateOf(reading),
    }));
}
