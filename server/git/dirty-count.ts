import { git } from "./worktrees.js";
import { createTtlCache } from "./ttl-cache.js";

// `git status` is the most expensive thing the roster asks for, and the roster asks for it on
// a timer — per directory AND per worktree of that directory. On a small repo that is free.
// On a big one it is not: measured at 10.7s on an 86k-file lfs repo, against a poll interval
// of a few seconds. Unguarded, every tick spawned another `git status` on top of the ones
// still running, each one making the next slower, until the machine held ~1,200 git / sh /
// git-lfs processes and ~23GB (see kill-tree.ts for the other half of that failure).
//
// Two guards, in order:
//   * a short TTL, so an answer just computed is reused instead of recomputed; and
//   * single flight, so concurrent callers for one directory share the ONE call in progress
//     rather than starting their own.
// Single flight is what bounds the process count — with it, one directory can never have two
// `git status` running no matter how fast the polling is.
export const DIRTY_COUNT_TTL_MS = 5_000;

const cache = createTtlCache<number>();
const inFlight = new Map<string, Promise<number>>();

export interface DirtyCountDeps {
  /** Injected for tests: the real one spawns `git status` in `cwd`. */
  run?: typeof git;
  now?: () => number;
  ttlMs?: number;
}

// `git status --porcelain` lists staged/unstaged changes and untracked files one per line, so
// a count of non-blank lines is the number of uncommitted entries.
const countLines = (stdout: string): number => stdout.split("\n").filter((l) => l.trim()).length;

export function dirtyCount(cwd: string, deps: DirtyCountDeps = {}): Promise<number> {
  const run = deps.run ?? git;
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? DIRTY_COUNT_TTL_MS;

  const fresh = cache.get(cwd, now, ttlMs);
  if (fresh !== undefined) return Promise.resolve(fresh);

  const running = inFlight.get(cwd);
  if (running) return running;

  const call = run(["status", "--porcelain"], cwd)
    .then((res) => {
      // A failure — a timeout, a dir that is not a repo — is cached like any other answer.
      // Retrying it on every tick is exactly the pile-up these guards exist to prevent, and
      // 0 is what this has always reported for a call it could not make.
      const n = res.ok ? countLines(res.stdout) : 0;
      cache.set(cwd, n, now);
      return n;
    })
    .finally(() => inFlight.delete(cwd));

  inFlight.set(cwd, call);
  return call;
}

/** Drop both guards. For tests, so one case cannot see the previous one's answer. */
export function resetDirtyCountCache(): void {
  cache.clear();
  inFlight.clear();
}
