// The decision digest (#1015): rewritten at startup and every few hours, but only for the
// directories this host actually works in, and only while the setting is on (checked inside
// writeDecisionDigest, so turning it off stops the next tick rather than needing a restart).
import { writeDecisionDigest } from "./decision-digest-file.js";
import { ptys } from "./registry.js";
import { CLAUDE_CWD } from "../config/env.js";

// Hours rather than minutes because a decision is a human act — a handful a day at most.
const DECISION_DIGEST_INTERVAL_MS = 6 * 60 * 60_000;

function refreshDecisionDigests(): void {
  const dirs = new Set<string>([CLAUDE_CWD, ...[...ptys.values()].map((entry) => entry.cwd)]);
  dirs.forEach((dir) => void writeDecisionDigest(dir, new Date()).catch(() => {}));
}

/** Writes once now, then on the timer. */
export function startDecisionDigestSchedule(): void {
  refreshDecisionDigests();
  setInterval(refreshDecisionDigests, DECISION_DIGEST_INTERVAL_MS).unref();
}
