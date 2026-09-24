// Finding the newest Codex rollout on disk and reading its tail. The parsing lives next door in
// codex-rate-limits.ts; this half is the filesystem, kept apart so the rules stay testable without
// one.
//
// Only the TAIL is read. A long Codex session's rollout runs to megabytes, the windows are written
// on nearly every event, and the one that matters is the last — so reading the whole file to reach
// its end would be the most expensive way to get the cheapest data source we have.
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { readTailLines } from "../infra/jsonl-file.js";

// Enough to hold several events even when one carries a large payload. A rollout whose last
// rate_limits sits further back than this simply reports nothing, which the gauge already handles.
const CODEX_ROLLOUT_TAIL_BYTES = 256 * 1024;

/** The tail of one rollout, at the size Codex needs.
 *
 *  A function rather than an exported number, so no caller can reach `readTailLines` without it.
 *  That is exactly how the size was lost: moving to the shared reader (#998) left the call site
 *  passing no size, which silently inherited a default meant for a Claude transcript — 4 MB
 *  instead of 256 KB, measured at 0.5 ms → 7.9 ms per poll against a 5.9 MB rollout, on the
 *  request path, for the same answer every time. A remembered argument regresses in silence; a
 *  named reader cannot. */
export const readRolloutTail = (file: string): string[] => readTailLines(file, CODEX_ROLLOUT_TAIL_BYTES);

// The walk below is synchronous and covers the whole sessions tree — hundreds of files on a
// long-standing install — while the refresh route calls it on every poll. Unthrottled, that blocks
// the event loop (every terminal socket with it) on a schedule. Which file is newest changes only
// when Codex starts one, so re-walking within this window can only produce the same answer.
const NEWEST_FILE_CACHE_MS = 30_000;
// One entry per root: the default home and each codex account are read on the same poll, and a
// single slot would be evicted by the next root every time.
const cached = new Map<string, { file: string | null; at_ms: number }>();

/** The most recently modified `*.jsonl` under the sessions tree, or null. Codex nests them by
 * date (`2026/07/28/rollout-….jsonl`), so this walks rather than reading one directory. */
export function newestRolloutFile(root: string, now_ms: number): string | null {
  const entry = cached.get(root);
  if (entry && now_ms - entry.at_ms < NEWEST_FILE_CACHE_MS) return entry.file;
  const file = walkForNewest(root, now_ms);
  cached.set(root, { file, at_ms: now_ms });
  return file;
}

/** Uncached, so a test can exercise the walk itself without reaching through the cache. */
export function walkForNewest(root: string, now_ms: number): string | null {
  if (!existsSync(root)) return null;
  const found: { file: string; stamp_ms: number }[] = [];
  const walk = (dir: string, depth: number): void => {
    const MAX_DEPTH = 5;
    if (depth > MAX_DEPTH) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.name.endsWith(".jsonl")) continue;
      // A file stamped in the future would win forever; treat it as now rather than trusting it.
      found.push({ file: full, stamp_ms: Math.min(statSync(full).mtimeMs, now_ms) });
    }
  };
  try {
    walk(root, 0);
  } catch {
    // an unreadable subtree costs whatever it held, not the feature
  }
  return found.reduce<{ file: string; stamp_ms: number } | null>((best, c) => (best === null || c.stamp_ms > best.stamp_ms ? c : best), null)?.file ?? null;
}
