// Which credential a new session runs on, when several subscriptions share one home (#2919).
//
// The goal is the user's: drain every weekly window as evenly as possible. Ranking by remaining %
// alone would sit on a window that resets tomorrow with half of it unused while spending one that
// has six days left, so the rule ranks by BURN PACE — what is left per hour until it resets. The
// window about to reset with room in it goes first, because that room is lost at the reset.
//
// Pure: the caller supplies the readings and the clock.
import type { RateLimits, RateLimitWindow } from "../../common/rateLimits.js";

export interface TokenCandidate {
  id: string;
  /** The last reading for this credential, however old; null when it was never measured. */
  limits: RateLimits | null;
  /** Until when a limit hit observed on a session holds it out, in Unix seconds. */
  spentUntil_sec?: number | null;
}

/** At or above this, a 5-hour window is too close to blocking a turn to start a session on it. */
export const FIVE_HOUR_CEILING_PERCENT = 90;
export const SEVEN_DAY_CEILING_PERCENT = 100;
/** A window resetting within this many hours is ranked as if it had this long left, so a reading
 *  a minute before its reset does not dwarf every other candidate. */
export const MIN_HOURS_TO_RESET = 1;
const SECONDS_PER_HOUR = 3600;
const FULL_PERCENT = 100;
const HOURS_PER_WEEK = 7 * 24;

/** A window whose reset has already passed holds nothing back. */
const usedNow = (window: RateLimitWindow | null, now_sec: number): number => {
  if (!window) return 0;
  return window.resetsAt_sec !== null && window.resetsAt_sec <= now_sec ? 0 : window.usedPercentage;
};

/** When this candidate can take a session again, or null when it can now. */
export function blockedUntil(candidate: TokenCandidate, now_sec: number): number | null {
  const blocks: number[] = [];
  if (candidate.spentUntil_sec && candidate.spentUntil_sec > now_sec) blocks.push(candidate.spentUntil_sec);
  const limits = candidate.limits;
  const reset = (window: RateLimitWindow | null): number => window?.resetsAt_sec ?? Number.POSITIVE_INFINITY;
  if (limits && usedNow(limits.sevenDay, now_sec) >= SEVEN_DAY_CEILING_PERCENT) blocks.push(reset(limits.sevenDay));
  if (limits && usedNow(limits.fiveHour, now_sec) >= FIVE_HOUR_CEILING_PERCENT) blocks.push(reset(limits.fiveHour));
  return blocks.length > 0 ? Math.max(...blocks) : null;
}

/** Remaining weekly percent per hour to its reset — higher is more urgent to use. A reading with no
 *  7-day window, or no reset time, is ranked by what remains over a full week. */
export function burnPace(limits: RateLimits, now_sec: number): number {
  const window = limits.sevenDay;
  const remaining = FULL_PERCENT - usedNow(window, now_sec);
  const resetsAt = window?.resetsAt_sec;
  const hours = resetsAt && resetsAt > now_sec ? (resetsAt - now_sec) / SECONDS_PER_HOUR : HOURS_PER_WEEK;
  return remaining / Math.max(hours, MIN_HOURS_TO_RESET);
}

const RANK_MEASURED = 0;
const RANK_UNMEASURED = 1;

/**
 * The candidate a new session should run on, or null when there are none.
 *
 * Eligible and measured first, by burn pace; then eligible but never measured (the next probe
 * measures it); and only when every one is held out, the one free soonest. Ties keep config order.
 */
export function chooseToken(candidates: readonly TokenCandidate[], now_sec: number): string | null {
  if (candidates.length === 0) return null;
  const free = candidates.filter((candidate) => blockedUntil(candidate, now_sec) === null);
  if (free.length === 0) {
    const freeAt = (candidate: TokenCandidate): number => blockedUntil(candidate, now_sec) ?? now_sec;
    return candidates.reduce((best, candidate) => (freeAt(candidate) < freeAt(best) ? candidate : best)).id;
  }
  const ranked = free.map((candidate, order) => ({
    id: candidate.id,
    order,
    rank: candidate.limits ? RANK_MEASURED : RANK_UNMEASURED,
    pace: candidate.limits ? burnPace(candidate.limits, now_sec) : 0,
  }));
  ranked.sort((a, b) => a.rank - b.rank || b.pace - a.pace || a.order - b.order);
  return ranked[0]?.id ?? null;
}
