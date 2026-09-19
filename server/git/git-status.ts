// Read-only git status for a terminal's working dir, so the header can always show
// branch / dirty / ahead·behind without the user running `git status`. Reuses the
// shared git runner and never throws — a non-repo dir is just `repo:false`.
import type { GitStatus } from "../../common/gitStatus.js";
import { git, gitTopLevel } from "./worktrees.js";
import { dirtyCount } from "./dirty-count.js";
import { coalesceByKey, type CoalesceOptions } from "../infra/coalesce-by-key.js";

const NOT_REPO: GitStatus = { repo: false, branch: null, detached: false, dirty: 0, ahead: 0, behind: 0, upstream: false };

const toCount = (s: string): number => {
  const n = parseInt(s.trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

// The current branch, or detached when HEAD isn't on a branch. Exported for the callers
// that want only the branch — one git call instead of gitStatus's four. `symbolic-ref`
// resolves the branch even on an UNBORN branch (fresh `git init` before the first
// commit), where `rev-parse --abbrev-ref HEAD` fails; it also fails cleanly on a
// detached HEAD, which we then confirm by whether HEAD resolves to a commit.
export async function currentBranch(cwd: string): Promise<{ branch: string | null; detached: boolean }> {
  const sym = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
  const name = sym.ok ? sym.stdout.trim() : "";
  if (name) return { branch: name, detached: false };
  const head = await git(["rev-parse", "--verify", "--quiet", "HEAD"], cwd);
  return { branch: null, detached: head.ok };
}

// ahead/behind vs the tracking branch. `--left-right @{upstream}...HEAD` prints
// "<behind>\t<ahead>"; a missing upstream makes the command fail → upstream:false.
async function aheadBehind(cwd: string): Promise<{ ahead: number; behind: number; upstream: boolean }> {
  const res = await git(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], cwd);
  if (!res.ok) return { ahead: 0, behind: 0, upstream: false };
  const [behind, ahead] = res.stdout.trim().split(/\s+/);
  return { ahead: toCount(ahead ?? ""), behind: toCount(behind ?? ""), upstream: true };
}

async function readGitStatus(cwd: string): Promise<GitStatus> {
  const [head, dirty, ab] = await Promise.all([currentBranch(cwd), dirtyCount(cwd), aheadBehind(cwd)]);
  return { repo: true, branch: head.branch, detached: head.detached, dirty, ahead: ab.ahead, behind: ab.behind, upstream: ab.upstream };
}

// One read per WORKTREE at a time, not per cwd string. Every cell open on the same checkout asks
// this question on its own poll, and each read costs three git processes that scan the whole
// worktree — on a busy machine those overlap, and overlapping is what makes each one slower
// (#2164). Keyed by the top level because the answer does not vary within a worktree: `git status
// --porcelain`, the branch and ahead/behind are identical from the root and from any subdirectory,
// and a cell's cwd can be a subdirectory of another cell's (the launch panel takes any directory
// and then records it as a preset), which a per-cwd key would let stack again (Codex review).
//
// Resolving that key is itself a git process, and it is coalesced too — by cwd, because the cwd is
// all we have before `rev-parse` answers. Without it the key lookup is a gap in which a caller is
// not yet registered: two reads of one cwd could both be mid-`rev-parse`, and the later one would
// find the earlier one already finished and start a second full read (#2196).
//
// Keyed by cwd and NOT by the top level, which would be circular — and the read below stays keyed
// by the top level, since per-cwd keying there is what #2164 rejected: one cell's cwd can be a
// subdirectory of another's, and per-cwd those two would stack reads of one worktree again.
//
// `fresh` is deliberately not forwarded: it exists so a caller that just wrote can avoid joining a
// read that sampled the tree first, and a directory's worktree root is not what a turn changes.
const coalesce = coalesceByKey<string, GitStatus>();
const coalesceTopLevel = coalesceByKey<string, string | null>();

export async function gitStatus(cwd: string, opts?: CoalesceOptions): Promise<GitStatus> {
  const top = await coalesceTopLevel(cwd, () => gitTopLevel(cwd));
  if (!top) return NOT_REPO;
  return coalesce(top, () => readGitStatus(cwd), opts);
}
