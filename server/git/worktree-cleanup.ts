// The facts behind the Processes page's worktree list (#2219): every managed worktree of every repo
// a terminal has run in, with what would be lost or interrupted by removing it. The verdict is
// common/worktreeCleanup.ts; this only reads git, tmux and the session records.
import { existsSync } from "node:fs";
import { baseStartPoint, defaultBaseBranch, git, listWorktrees, repoRoot, type WorktreeInfo } from "./worktrees.js";
import { mapConcurrent } from "../infra/async/mapConcurrent.js";
import { isWithin } from "../infra/fs/path-within.js";
import { canonicalPath } from "../infra/fs/canonical-path.js";
import { tmuxAttachedCounts, tmuxAvailable, tmuxPaneCwdsAsync } from "../infra/process/tmux.js";
import { dirSession, survivorSnapshot } from "../session/dir-session.js";
import { ptys } from "../session/registry.js";
import { IGNORED_LISTED_MAX, worktreeStatus, type WorktreeCleanupRow } from "../../common/worktreeCleanup.js";

// Each repo is a handful of git calls; a few at once keeps a long cwd history from forking dozens.
const GIT_CONCURRENCY = 4;

/** The main checkout of each folder that still exists, once per repo. */
async function reposOf(cwds: readonly string[]): Promise<string[]> {
  const existing = [...new Set(cwds)].filter((cwd) => existsSync(cwd));
  const roots = await mapConcurrent(existing, GIT_CONCURRENCY, (cwd) => repoRoot(cwd));
  return [...new Set(roots.flatMap((root) => root ?? []))].sort((a, b) => a.localeCompare(b));
}

async function statusOf(worktreePath: string): Promise<{ dirty: boolean; ignored: string[] }> {
  const res = await git(["status", "--porcelain", "--ignored"], worktreePath);
  return worktreeStatus(res.ok ? res.stdout : null);
}

const isMerged = async (repo: string, head: string, startPoint: string): Promise<boolean> =>
  head !== "" && (await git(["merge-base", "--is-ancestor", head, startPoint], repo)).ok;

interface UsageFacts {
  /** Null when nobody can say where panes are: then every worktree counts as in use. */
  paneCwds: readonly string[] | null;
  inAgentSession: (dir: string) => Promise<boolean>;
}

async function rowOf(repo: string, base: string, startPoint: string, worktree: WorktreeInfo, usage: UsageFacts): Promise<WorktreeCleanupRow> {
  const exists = existsSync(worktree.path);
  const canonical = canonicalPath(worktree.path);
  const status = exists ? await statusOf(worktree.path) : { dirty: false, ignored: [] };
  const paneHere = usage.paneCwds === null || usage.paneCwds.some((cwd) => isWithin(canonical, canonicalPath(cwd)));
  return {
    repo,
    base,
    path: worktree.path,
    branch: worktree.branch,
    head: worktree.head,
    exists,
    dirty: status.dirty,
    ignored: status.ignored.slice(0, IGNORED_LISTED_MAX),
    ignoredCount: status.ignored.length,
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

/** Without tmux nothing outlives a restart, so this process's own terminals are every pane there is.
 *  With tmux and no answer from it, a shell that survived a restart could be standing anywhere, and
 *  this process's terminals do not include it — so nothing can be shown to be unused. */
async function paneCwdsOrUnknown(): Promise<readonly string[] | null> {
  const listed = await tmuxPaneCwdsAsync();
  if (listed !== null) return listed;
  return tmuxAvailable() ? null : [...ptys.values()].map((entry) => entry.cwd);
}

async function usageFacts(): Promise<UsageFacts> {
  const tmuxCounts = tmuxAttachedCounts();
  const running = await survivorSnapshot();
  const now = Date.now();
  return {
    paneCwds: await paneCwdsOrUnknown(),
    // dirSession also answers with a finished conversation that could be resumed; only a RUNNING
    // one holds the worktree.
    inAgentSession: async (dir) => {
      const session = await dirSession(dir, tmuxCounts, now, running);
      return session !== null && (session.attached || running.has(session.id));
    },
  };
}

/** Every managed worktree of the repos behind `cwds`. */
export async function worktreeCleanupRows(cwds: readonly string[]): Promise<WorktreeCleanupRow[]> {
  const repos = await reposOf(cwds);
  const usage = await usageFacts();
  const perRepo = await mapConcurrent(repos, GIT_CONCURRENCY, (repo) => repoRows(repo, usage));
  return perRepo.flat();
}

/** One managed worktree read again, for the moment it is about to be removed: the list the page
 *  showed may be minutes old, and a commit or a terminal since then must stop the removal. Null
 *  when `worktreePath` is not a managed worktree of `repoDir`. */
export async function cleanupRowAt(repoDir: string, worktreePath: string): Promise<WorktreeCleanupRow | null> {
  const repo = await repoRoot(repoDir);
  if (repo === null) return null;
  const target = canonicalPath(worktreePath);
  const worktree = (await listWorktrees(repo)).find((candidate) => canonicalPath(candidate.path) === target);
  if (worktree === undefined) return null;
  const base = await defaultBaseBranch(repo);
  return rowOf(repo, base, await baseStartPoint(repo, base), worktree, await usageFacts());
}

/** Delete `branch` only while it still points at `head`, the commit that was found merged. A commit
 *  made after that check moves the ref, `update-ref` then refuses, and the branch stays — so the
 *  check and the deletion cannot be split by a commit the way a `branch -D` after them could. */
export async function deleteBranchIfAt(repo: string, branch: string, head: string): Promise<boolean> {
  return (await git(["update-ref", "-d", `refs/heads/${branch}`, head], repo)).ok;
}
