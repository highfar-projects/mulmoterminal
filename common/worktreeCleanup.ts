// Which managed worktrees can go (#2219). Nothing is removed automatically: the page lists every
// worktree with what holds it back, and a person removes a candidate with a button.
//
// In `common/` because both sides decide from it: the server gathers the facts
// (server/git/worktree-cleanup.ts), the page shows the verdict and the reasons.
import { isRecord } from "./isRecord.js";
import { isUnknownArray } from "./isUnknownArray.js";

export interface WorktreeCleanupRow {
  /** The main checkout — what `POST /api/worktrees/remove` takes as `repoDir`. */
  repo: string;
  base: string;
  path: string;
  branch: string | null;
  exists: boolean;
  /** Uncommitted or untracked files: removing it would lose them. */
  dirty: boolean;
  /** Every commit on it is already in the base. Ancestry, so a squash-merged branch reads as
   *  unmerged — the safe direction. */
  merged: boolean;
  /** An agent session belongs to it, or a pane of ours stands in it (a plain shell counts). */
  inUse: boolean;
}

export const CLEANUP_BLOCKERS = ["missing", "dirty", "unmerged", "inUse"] as const;
export type CleanupBlocker = (typeof CLEANUP_BLOCKERS)[number];

/** What keeps a worktree from being a removal candidate, in a fixed order. Empty means it can go. */
export function cleanupBlockers(row: WorktreeCleanupRow): CleanupBlocker[] {
  const holds: Record<CleanupBlocker, boolean> = { missing: !row.exists, dirty: row.dirty, unmerged: !row.merged, inUse: row.inUse };
  return CLEANUP_BLOCKERS.filter((blocker) => holds[blocker]);
}

export const isCleanupCandidate = (row: WorktreeCleanupRow): boolean => cleanupBlockers(row).length === 0;

const isCleanupRow = (value: unknown): value is WorktreeCleanupRow =>
  isRecord(value) &&
  typeof value.repo === "string" &&
  typeof value.base === "string" &&
  typeof value.path === "string" &&
  (value.branch === null || typeof value.branch === "string") &&
  typeof value.exists === "boolean" &&
  typeof value.dirty === "boolean" &&
  typeof value.merged === "boolean" &&
  typeof value.inUse === "boolean";

/** A `GET /api/worktrees/cleanup` body, or null when it is not one. */
export function readWorktreeCleanupBody(body: unknown): WorktreeCleanupRow[] | null {
  if (!isRecord(body) || !isUnknownArray(body.worktrees)) return null;
  return body.worktrees.filter(isCleanupRow);
}
