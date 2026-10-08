# fix: a git() call settles by its timeout even when a grandchild holds the pipes (#2935)

## Problem

`git()` (`server/git/worktrees.ts`) and `spawnCollect()` (`server/git/spawn-collect.ts`) passed
Node's `timeout` to `spawn` and resolved on `close`. Node's `timeout` signals the direct child only,
and `close` waits until every holder of the stdio pipes has gone. A grandchild that inherited
stdout — git-lfs `filter-process` under a killed `git status` — therefore kept the promise pending
for as long as it lived, and survived as a stray process.

Reproduced on macOS: `git(["-c", "alias.hang=!sleep 8 & sleep 8", "hang"], undefined, 500)`
settled only when the grandchild exited, not at 500ms.

After #2164, `coalesceByKey` holds an in-flight read until it settles, so one hung read would
freeze that worktree's status for every later caller.

## Change

- `server/git/kill-tree.ts` — POSIX: the child leads its own process group (`detached: true`), and
  the group gets SIGTERM, then SIGKILL after a grace. SIGTERM first because git removes its lock
  files on SIGTERM and not on SIGKILL. Windows: `taskkill /T /F`.
- `server/git/run-tool.ts` — one place that spawns, drains, decodes and stops. Settles:
  - on `close`, as before;
  - at the deadline, after killing the tree, without waiting for `close`;
  - on abort and on the stdout cap, the same way;
  - a short drain after `exit` when `close` does not follow, so a lingering holder of the pipe
    cannot turn a run that finished in time into a hang (or a timeout).
- `git()` and `spawnCollect()` are mapped onto it, keeping their result shapes.

## Intended behaviour differences

- A timed-out / aborted / capped call now settles at once and kills the child's process group.
- `git()` with the stdout cap returns `code: null` (it could return the exit code when git happened
  to finish before the kill landed). The only reader, `files-git-status.ts`, reads `overflow` only.
- `spawnCollect()` with an argument `spawn` refuses (a NUL byte) resolves `ok: false` with
  `errorStderr` instead of rejecting — its contract already said it never rejects.
- POSIX: the child no longer shares our process group, so a Ctrl+C on the server's terminal is
  not delivered to an in-flight git; it ends on its own or by its deadline.

## Out of scope

- `spawnCaptureAsync` (`execFile`) and the `spawnSync` sites have the same shape: #2941.
- Folding `readGitStatus`'s three processes into one `git status --porcelain=v2 --branch`.

## Verification

- `test/server/git/run-tool.spec.ts` starts a real child that leaves a grandchild holding stdout,
  and checks: settles at the deadline, the grandchild is gone, a child that exits in time keeps its
  answer, abort kills the tree.
- `test/server/git/git-spawn-contract.spec.ts` gains the issue's shape through real git (an alias
  backgrounding `sleep`); it fails on the previous code.
- A throwaway differential harness ran the previous `git()` / `spawnCollect()` beside the new ones
  over generated commands, directories, caps, signals, scripts, environments and timeouts; the only
  differences were the two intended ones listed above.
