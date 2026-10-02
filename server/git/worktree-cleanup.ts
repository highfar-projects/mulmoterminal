// The facts behind the Processes page's worktree list (#2219): every managed worktree of every repo
// a terminal has run in, with what would be lost or interrupted by removing it. The verdict is
// common/worktreeCleanup.ts; this only reads git, tmux and the session records.
import { existsSync } from "node:fs";
import { baseStartPoint, defaultBaseBranch, git, isDirty, listWorktrees, repoRoot, type WorktreeInfo } from "./worktrees.js";
import { mapConcurrent } from "../infra/mapConcurrent.js";
import { isWithin } from "../infra/path-within.js";
import { canonicalPath } from "../infra/canonical-path.js";
import { tmuxAttachedCounts, tmuxPaneCwdsAsync } from "../infra/tmux.js";
import { dirSession, survivorSnapshot } from "../session/dir-session.js";
import { ptys } from "../session/registry.js";
import type { WorktreeCleanupRow } from "../../common/worktreeCleanup.js";

// Each repo is a handful of git calls; a few at once keeps a long cwd history from forking dozens.
const GIT_CONCURRENCY = 4;

/** The main checkout of each folder that still exists, once per repo. */
async function reposOf(cwds: readonly string[]): Promise<string[]> {
  const existing = [...new Set(cwds)].filter((cwd) => existsSync(cwd));
  const roots = await mapConcurrent(existing, GIT_CONCURRENCY, (cwd) => repoRoot(cwd));
  return [...new Set(roots.flatMap((root) => root ?? []))].sort((a, b) => a.localeCompare(b));
}

const isMerged = async (repo: string, head: string, startPoint: string): Promise<boolean> =>
  head !== "" && (await git(["merge-base", "--is-ancestor", head, startPoint], repo)).ok;

interface UsageFacts {
  paneCwds: readonly string[];
  inAgentSession: (dir: string) => Promise<boolean>;
}

async function rowOf(repo: string, base: string, startPoint: string, worktree: WorktreeInfo, usage: UsageFacts): Promise<WorktreeCleanupRow> {
  const exists = existsSync(worktree.path);
  const canonical = canonicalPath(worktree.path);
  const paneHere = usage.paneCwds.some((cwd) => isWithin(canonical, canonicalPath(cwd)));
  return {
    repo,
    base,
    path: worktree.path,
    branch: worktree.branch,
    exists,
    dirty: exists && (await isDirty(worktree.path)),
    merged: await isMerged(repo, worktree.head, startPoint),
    inUse: paneHere || (exists && (await usage.inAgentSession(worktree.path))),
  };
}

async function repoRows(repo: string, usage: UsageFacts): Promise<WorktreeCleanupRow[]> {
  const base = await defaultBaseBranch(repo);
  const startPoint = await baseStartPoint(repo, base);
  const worktrees = await listWorktrees(repo);
  return mapConcurrent(worktrees, GIT_CONCURRENCY, (worktree) => rowOf(repo, base, startPoint, worktree, usage));
}

/** Every managed worktree of the repos behind `cwds`. Without an answer from tmux, the directories
 *  this process's own terminals started in stand in for where panes are — reading "no panes" there
 *  would offer a worktree a shell is standing in. */
export async function worktreeCleanupRows(cwds: readonly string[]): Promise<WorktreeCleanupRow[]> {
  const repos = await reposOf(cwds);
  const tmuxCounts = tmuxAttachedCounts();
  const running = await survivorSnapshot();
  const now = Date.now();
  const usage: UsageFacts = {
    paneCwds: (await tmuxPaneCwdsAsync()) ?? [...ptys.values()].map((entry) => entry.cwd),
    // dirSession also answers with a finished conversation that could be resumed; only a RUNNING
    // one holds the worktree.
    inAgentSession: async (dir) => {
      const session = await dirSession(dir, tmuxCounts, now, running);
      return session !== null && (session.attached || running.has(session.id));
    },
  };
  const perRepo = await mapConcurrent(repos, GIT_CONCURRENCY, (repo) => repoRows(repo, usage));
  return perRepo.flat();
}
