// Read-only git status for a terminal's working dir, so the header can always show
// branch / dirty / ahead·behind without the user running `git status`. Never throws — a
// non-repo dir is just `repo:false`.
//
// ONE git call, behind a TTL cache and single flight. Both halves matter, and the shape they
// replace is why: this used to make FOUR calls — `rev-parse --show-toplevel`, then
// `symbolic-ref`, `status --porcelain` and `rev-list --left-right --count` concurrently — and
// only the `status` one was guarded. Measured on a 43.5k-file repo (24k commits): status 7.1s,
// rev-list 4.3-4.9s, rev-parse 207ms, symbolic-ref 47ms. The roster polls every 4s PER
// DIRECTORY, so the unguarded rev-list spawned faster than it finished and stacked up — three
// and four of them alive at once on one directory, while the guarded status beside it stayed
// at exactly one, which is what pointed at the gap. On Windows each is TWO processes, because
// `Git/cmd/git.exe` is a 46KB wrapper that execs the real 4.4MB `Git/mingw64/bin/git.exe`.
//
// `status --porcelain=v2 --branch` answers all of it in one spawn (see parsePorcelainV2), so
// the guard now covers everything this reads instead of one call out of four.
import type { GitStatus } from "../../common/gitStatus.js";
import { git } from "./worktrees.js";
import { parsePorcelainV2 } from "./git-parse.js";
import { splitLines } from "../infra/split-lines.js";
import { createTtlCache } from "./ttl-cache.js";

const NOT_REPO: GitStatus = { repo: false, branch: null, detached: false, dirty: 0, ahead: 0, behind: 0, upstream: false };

// Short enough that the chip still tracks a commit or a checkout closely — a turn ending
// forces a refresh anyway (TerminalCell watches working → settled) — and long enough that the
// roster's 4s tick mostly lands on a cached answer rather than starting another status.
export const GIT_STATUS_TTL_MS = 5_000;

const cache = createTtlCache<GitStatus>();
const inFlight = new Map<string, Promise<GitStatus>>();

export interface GitStatusDeps {
  /** Injected for tests: the real one spawns `git` in `cwd`. */
  run?: typeof git;
  now?: () => number;
  ttlMs?: number;
}

// The current branch, or detached when HEAD isn't on a branch. Kept as its own pair of calls
// rather than a read of gitStatus: `symbolic-ref` is 47ms against a status that can be seven
// seconds, and its caller is the phone's per-session header, which wants the branch now rather
// than whenever the shared status call for that directory happens to finish.
// `symbolic-ref` resolves the branch even on an UNBORN branch (fresh `git init` before the
// first commit), where `rev-parse --abbrev-ref HEAD` fails; it also fails cleanly on a
// detached HEAD, which we then confirm by whether HEAD resolves to a commit.
export async function currentBranch(cwd: string): Promise<{ branch: string | null; detached: boolean }> {
  const sym = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd);
  const name = sym.ok ? sym.stdout.trim() : "";
  if (name) return { branch: name, detached: false };
  const head = await git(["rev-parse", "--verify", "--quiet", "HEAD"], cwd);
  return { branch: null, detached: head.ok };
}

export function gitStatus(cwd: string, deps: GitStatusDeps = {}): Promise<GitStatus> {
  const run = deps.run ?? git;
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? GIT_STATUS_TTL_MS;

  const fresh = cache.get(cwd, now, ttlMs);
  if (fresh !== undefined) return Promise.resolve(fresh);

  // Single flight is the part that bounds the process count: one directory can never have two
  // `git status` running, however fast the polling ticks or however many callers there are.
  const running = inFlight.get(cwd);
  if (running) return running;

  const call = run(["status", "--porcelain=v2", "--branch"], cwd)
    .then((res) => {
      // A failed call is `repo:false`, and is cached like any other answer. Not a repo at all
      // is by far the common failure and that IS the right answer for it; a real repo whose
      // status failed loses the chip for one TTL rather than being retried every tick, which
      // is the pile-up these guards exist to prevent.
      const status: GitStatus = res.ok ? { repo: true, ...parsePorcelainV2(res.stdout, splitLines) } : NOT_REPO;
      cache.set(cwd, status, now);
      return status;
    })
    .finally(() => inFlight.delete(cwd));

  inFlight.set(cwd, call);
  return call;
}

// Uncommitted entries alone, for the callers that want only that. Reads the SAME guarded call
// the header chip does, so asking for both costs one `git status`, not two.
export async function dirtyCount(cwd: string, deps: GitStatusDeps = {}): Promise<number> {
  return (await gitStatus(cwd, deps)).dirty;
}

/** Drop both guards. For tests, so one case cannot see the previous one's answer. */
export function resetGitStatusCache(): void {
  cache.clear();
  inFlight.clear();
}
