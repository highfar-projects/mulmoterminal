import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

// End a spawned dev tool AND everything it started.
//
// `git` and `gh` already had timeouts, but the timeout did not end the call it was meant to
// end. Node's `timeout` option signals the DIRECT child only, and a `git status` in an lfs
// repo is a whole tree — git spawns `sh`, which spawns `git-lfs filter-process`. Signalling
// git leaves those descendants running, still holding the stdio pipes, so nothing is actually
// reclaimed and (see run-tool.ts) `close` never fires either.
//
// Measured on an 86k-file lfs repo polled by the roster: ~1,200 orphaned git / sh / git-lfs
// processes holding ~23GB of a 32GB machine, growing ~900/hour until sessions could not start.
//
// `taskkill /T` is the only thing on Windows that walks the tree. Elsewhere the child is spawned
// `detached` (run-tool.ts), which makes it the leader of its own process group, so signalling the
// NEGATIVE pid reaches every descendant in that group the same way `taskkill /T` does on Windows —
// a bare `child.kill()` only ever reached the direct child and left `sh` / `git-lfs` behind.
export interface KillTreeDeps {
  /** Injected for tests: the real one runs taskkill, which must never be aimed at a made-up pid. */
  spawnFn?: typeof spawn;
}

export function killTree(child: ChildProcess, platform: NodeJS.Platform = process.platform, deps: KillTreeDeps = {}): void {
  const pid = child.pid;
  // No pid means the spawn itself failed; there is nothing running to kill.
  if (pid === undefined) return;
  if (platform !== "win32") {
    // The group can already be gone (the child exited between the deadline firing and this
    // running) — an ESRCH here is an ordinary outcome, not a bug.
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
    return;
  }
  // stdio:"ignore" so the killer cannot inherit the very pipes we are trying to release, and
  // unref so a slow taskkill never holds the server's event loop open. An error here is an
  // ordinary outcome — by the time it runs the tree may already be gone.
  const killer = (deps.spawnFn ?? spawn)("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  killer.on("error", () => {});
  killer.unref();
}
