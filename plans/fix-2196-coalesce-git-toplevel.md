# fix: coalesce the key lookup, not just the read (#2196)

## The defect

`gitStatus` resolved its coalescing key *before* registering:

```ts
const top = await gitTopLevel(cwd);          // a real `rev-parse` process
return coalesce(top, () => readGitStatus(cwd), opts);
```

`coalesceByKey` registers synchronously, so **callers that have their key always join**. The gap is
the await above it: while a caller is resolving its key it is not in the in-flight map, so a second
caller cannot see it. If the first caller's whole read then finishes before the second's `rev-parse`
answers, the second finds nothing to join and starts another full read.

That is correct behaviour for `coalesceByKey`, which documents itself as deliberately not a cache.
The thing in the wrong place is the key lookup.

## Why it matters in production

`useGitStatus.ts` polls `/api/git-status` per terminal, served by `dir-routes.ts` calling
`gitStatus(cwd)`. Several cells on one repository is ordinary use, and their reads coincide on tab
focus and on first mount — `usePollWhileVisible` registers `focus` and `visibilitychange` per cell,
and one event dispatches to all of them. (The intervals themselves are per component and drift, so
those two are the moments that align.)

Missing the join costs a duplicate read, and a read is several git processes over the whole
worktree. The window widens exactly when process spawning is contended — so the mitigation from
\#2164 weakens under the load it exists for.

## The change

The key lookup is coalesced too, keyed by **cwd** — all that identifies a caller before `rev-parse`
answers. Callers sharing a cwd then share one key promise, resume together, and register before any
of them can finish.

The read below stays keyed by the **top level**. Keying it per cwd is what #2164 rejected: one
cell's cwd can be a subdirectory of another's, and per-cwd those two would stack reads of one
worktree again.

`fresh` is forwarded to the key lookup as well as to the read. It is the forced post-turn read, and
a turn is arbitrary work: one that runs `git init` or `git worktree add` changes the root, so a
forced read that joined a lookup started before it would answer about the directory as it was. The
first draft of this change did not forward it, on the argument that a root is not what a turn
changes — which is false for exactly the turns a forced read exists to observe.

## What this does NOT fix, measured rather than assumed

**Two different cwds of one worktree still run two reads.** They are only known to share a worktree
once `rev-parse` has answered for each, so nothing can join them before that.

This was measured, not reasoned about: a spec defers the key lookup per call, so the interleaving is
chosen rather than waited for. Before the change both the same-cwd and different-cwd pairs ran two
reads; after it the same-cwd pair runs one and the different-cwd pair still runs two. That boundary
is now a spec of its own, so nobody has to rediscover it.

Closing it would need a remembered cwd-to-root mapping. That is a correctness decision rather than a
tidy-up, and is deliberately **not** taken here: the read is keyed by root but RUN with the first
registrant's cwd, so a stale mapping would serve one worktree's status for another. It wants its own
issue and its own argument about invalidation.

## The flaky spec this explains

`serves two different cwds of ONE worktree from a single run` asserted `toBe` — object identity —
on the pair that is now known not to be joinable on demand. It passed on timing and failed on a
loaded runner. It now asserts the answer rather than the identity, and says why in place. The
same-cwd spec keeps its identity assertion, which this change makes deterministic.

## Verification

- A spec file that forces the interleaving deterministically instead of waiting for CI to flake:
  both callers mid-lookup, the first one's read allowed to finish, then the second's key resolved.
- Break-verified: putting the key lookup back outside the coalescing reddens the deterministic
  specs, and the boundary spec stays green either way, which is what makes it a boundary.
- The repo-backed specs next door still pass; they were re-run standalone with raised timeouts,
  because a hook that builds a temp git repo times out on a loaded machine for reasons that have
  nothing to do with this change.
