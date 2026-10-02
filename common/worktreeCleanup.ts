// Which managed worktrees can go (#2219). Nothing is removed automatically: the page lists every
// worktree with what holds it back, and a person removes a candidate with a button.
//
// In `common/` because both sides decide from it: the server gathers the facts
// (server/git/worktree-cleanup.ts), the page shows the verdict and the reasons.
import { isRecord } from "./isRecord.js";
import { isUnknownArray } from "./isUnknownArray.js";

export interface WorktreeCleanupRow {
  /** The main checkout — what `POST /api/worktrees/cleanup/remove` takes as `repoDir`. */
  repo: string;
  base: string;
  path: string;
  branch: string | null;
  /** The commit the branch was at when `merged` was decided — the only commit its deletion may take. */
  head: string;
  exists: boolean;
  /** Uncommitted or untracked files: removing it would lose them. */
  dirty: boolean;
  /** Gitignored entries, which `git worktree remove` deletes WITHOUT counting the tree as dirty — a
   *  local `.env` as much as a `node_modules`. Not a blocker, since nearly every worktree has some;
   *  named to the person instead. At most `IGNORED_LISTED_MAX`; `ignoredCount` is the total. */
  ignored: string[];
  ignoredCount: number;
  /** Every commit on it is already in the base. Ancestry, so a squash-merged branch reads as
   *  unmerged — the safe direction. */
  merged: boolean;
  /** An agent session belongs to it, or a pane of ours stands in it (a plain shell counts). */
  inUse: boolean;
}

export const IGNORED_LISTED_MAX = 20;

/** The entries `git status --porcelain --ignored` marks `!!`. An ignored directory is one entry
 *  (`node_modules/`): git does not descend into it. */
export const parseIgnoredEntries = (porcelain: string): string[] =>
  porcelain.split("\n").flatMap((line) => (line.startsWith("!! ") && line.length > 3 ? [line.slice(3)] : []));

/** Dirty and ignored from ONE `git status --porcelain --ignored`. Null output is a status that
 *  failed: then nothing is known to be safe to lose, so it reads as dirty — a blocker. */
export function worktreeStatus(porcelain: string | null): { dirty: boolean; ignored: string[] } {
  if (porcelain === null) return { dirty: true, ignored: [] };
  const lines = porcelain.split("\n").filter((line) => line.trim() !== "");
  return { dirty: lines.some((line) => !line.startsWith("!! ")), ignored: parseIgnoredEntries(porcelain) };
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
  typeof value.head === "string" &&
  typeof value.exists === "boolean" &&
  typeof value.dirty === "boolean" &&
  isUnknownArray(value.ignored) &&
  value.ignored.every((entry) => typeof entry === "string") &&
  typeof value.ignoredCount === "number" &&
  typeof value.merged === "boolean" &&
  typeof value.inUse === "boolean";

/** A `GET /api/worktrees/cleanup` body, or null when it is not one. */
export function readWorktreeCleanupBody(body: unknown): WorktreeCleanupRow[] | null {
  if (!isRecord(body) || !isUnknownArray(body.worktrees)) return null;
  return body.worktrees.filter(isCleanupRow);
}
