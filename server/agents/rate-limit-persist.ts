// The last reading, kept across restarts (#387).
//
// Without this the gauge is empty every time the server starts and stays empty until a probe
// finishes — the better part of a minute during which the header shows Codex alone, which reads as
// a broken feature rather than a pending one.
//
// Probing at boot instead would fix the display and cost a query on every restart. That is once a
// day for a user and once per SAVE for anyone running `yarn dev`, whose supervisor restarts the
// backend on every source change. A number from ten minutes ago is worth more than either.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { MULMOTERMINAL_HOME } from "../config/env.js";
import type { RateLimitSnapshot } from "./rate-limit-store.js";
import { parseRateLimits } from "../../common/rateLimits.js";
import { isRecord } from "../../common/isRecord.js";
import { finiteNumber } from "../../common/finiteNumber.js";

/** The default login's cache, or one other LOGIN's (#2215) — named by a hash of `<agent>:<home>`, so
 *  an account id later pointed at a different home starts a different file rather than showing the
 *  old login's usage under the new one. A file per login rather than a widened shape: an older build
 *  parses `rate-limits.json`, and a key it has never heard of costs nothing only when it is absent. */
export const rateLimitCacheFile = (login?: string): string =>
  path.join(
    MULMOTERMINAL_HOME,
    login ? `rate-limits-login-${createHash("sha256").update(login).digest("hex").slice(0, LOGIN_HASH_CHARS)}.json` : "rate-limits.json",
  );

// Enough to keep the handful of logins one user has apart; the file name is not a security boundary.
const LOGIN_HASH_CHARS = 16;

/**
 * What was cached, as the store's own shape. Every field is re-validated rather than trusted: this
 * file survives upgrades, so it is the one input guaranteed to have been written by a different
 * version of this code.
 */
export function parseRateLimitCache(text: string): RateLimitSnapshot {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return {};
    const entries = (["claude", "codex"] as const).flatMap((agent) => {
      const entry = parsed[agent];
      if (!isRecord(entry)) return [];
      const limits = parseRateLimits(entry.limits);
      const reportedAt_ms = finiteNumber(entry.reportedAt_ms);
      return limits && reportedAt_ms !== null ? [[agent, { limits, reportedAt_ms }] as const] : [];
    });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/** Best effort in both directions: a cache that cannot be read or written costs the head start,
 * never the feature. */
export function readRateLimitCache(file: string): RateLimitSnapshot {
  try {
    return parseRateLimitCache(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/**
 * A writer that skips a write when nothing changed. Worth having because the caller is a request
 * handler and the write is synchronous: Codex is re-read on EVERY poll, and its windows move once
 * every few minutes at most, so the unguarded version wrote the same bytes on the event loop a few
 * times a minute — more often while a probe is in flight and the client polls at seconds.
 *
 * A failed write leaves the remembered text alone, so the next report retries rather than assuming
 * the file holds something it does not.
 */
export function createRateLimitCacheWriter(file: string): (snapshot: RateLimitSnapshot) => void {
  let written: string | null = null;
  return (snapshot) => {
    const json = JSON.stringify(snapshot);
    if (json === written) return;
    try {
      writeFileSync(file, json, { mode: 0o600 });
      written = json;
    } catch {
      // the next report will try again
    }
  };
}
