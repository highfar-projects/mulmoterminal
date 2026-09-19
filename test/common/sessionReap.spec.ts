import { describe, it, expect } from "vitest";

import { DEFAULT_REAP_IDLE_DAYS, MAX_REAP_IDLE_DAYS, reapIdleSeconds, reapSweepEnabled, sanitizeReapIdleDays } from "../../common/sessionReap";
import {
  DEFAULT_REAP_INTERVAL_HOURS,
  MAX_REAP_INTERVAL_HOURS,
  MIN_REAP_INTERVAL_HOURS,
  reapIntervalMs,
  reapTimerEnabled,
  sanitizeReapIntervalHours,
} from "../../common/sessionReap";

// The number that decides when the server ends a session on its own (#1467). A wrong value here is
// either a sweep that never runs or one that runs too eagerly, and neither announces itself.
describe("sanitizeReapIdleDays", () => {
  it("keeps a whole number of days in range", () => {
    expect(sanitizeReapIdleDays(3)).toBe(3);
    expect(sanitizeReapIdleDays(MAX_REAP_IDLE_DAYS)).toBe(MAX_REAP_IDLE_DAYS);
  });

  // Zero is the off switch, so it must survive sanitizing — it is the one value a user picks to
  // stop the behaviour entirely.
  it("keeps zero, which is off", () => {
    expect(sanitizeReapIdleDays(0)).toBe(0);
    expect(reapSweepEnabled(0)).toBe(false);
  });

  // NOT rounded: `Math.round(0.4)` is 0, and 0 is the off switch — so rounding would let a
  // fractional value disable the sweep, which is the silent-disable the fallback exists to stop
  // (CodeRabbit on #1486).
  it.each([2.6, 0.4, 6.999])("refuses the fractional %p rather than rounding it", (value) => {
    expect(sanitizeReapIdleDays(value)).toBe(DEFAULT_REAP_IDLE_DAYS);
  });

  // Falling back to the DEFAULT rather than to 0: a corrupt value silently disabling the sweep
  // looks exactly like the bug this feature fixes, and nobody would think to look here.
  it.each([-1, MAX_REAP_IDLE_DAYS + 1, Number.NaN, Number.POSITIVE_INFINITY, "7", null, undefined, {}])("falls back to the default for %p", (value) => {
    expect(sanitizeReapIdleDays(value)).toBe(DEFAULT_REAP_IDLE_DAYS);
  });
});

describe("reapIdleSeconds", () => {
  it("is the threshold the sweep compares tmux's answer against", () => {
    expect(reapIdleSeconds(1)).toBe(86_400);
    expect(reapIdleSeconds(DEFAULT_REAP_IDLE_DAYS)).toBe(7 * 86_400);
  });
});

// #2165. The interval decides whether the sweep ever runs again after boot. Its default is OFF,
// which flips the failure this file's other half guards against: here a junk value must not
// silently ENABLE a server that ends sessions on its own.
describe("sanitizeReapIntervalHours", () => {
  it("keeps a whole number of hours in range", () => {
    expect(sanitizeReapIntervalHours(6)).toBe(6);
    expect(sanitizeReapIntervalHours(MIN_REAP_INTERVAL_HOURS)).toBe(MIN_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours(MAX_REAP_INTERVAL_HOURS)).toBe(MAX_REAP_INTERVAL_HOURS);
  });

  it("treats zero as off, and off is the default", () => {
    expect(sanitizeReapIntervalHours(0)).toBe(0);
    expect(reapTimerEnabled(0)).toBe(false);
    expect(DEFAULT_REAP_INTERVAL_HOURS).toBe(0);
  });

  it("falls back to off for a value out of range", () => {
    expect(sanitizeReapIntervalHours(-1)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours(MAX_REAP_INTERVAL_HOURS + 1)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
  });

  it("falls back to off for anything that is not a whole number", () => {
    expect(sanitizeReapIntervalHours(1.5)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours("6")).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours(null)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours(undefined)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours(NaN)).toBe(DEFAULT_REAP_INTERVAL_HOURS);
    expect(sanitizeReapIntervalHours({})).toBe(DEFAULT_REAP_INTERVAL_HOURS);
  });

  it("turns hours into the milliseconds the timer is armed with", () => {
    expect(reapIntervalMs(1)).toBe(60 * 60 * 1000);
    expect(reapIntervalMs(0)).toBe(0);
  });

  it("is enabled only above zero", () => {
    expect(reapTimerEnabled(1)).toBe(true);
    expect(reapTimerEnabled(MAX_REAP_INTERVAL_HOURS)).toBe(true);
  });
});
