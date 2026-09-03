// One spelling of a path, so two callers naming the same directory agree.
//
// Its own module rather than a member of git/worktrees.ts: the worktree-environment reservation
// (#1367) has to canonicalize too, and worktrees.ts reserves — so leaving it there would make the
// two import each other.
import { realpathSync } from "node:fs";
import path from "node:path";
import { isSamePath } from "./path-within.js";

// realpathSync.native, not the JS one: on Windows only the native call expands an 8.3 short
// component (C:\Users\RUNNER~1 → …\runneradmin) to the long form that `git worktree list`
// reports, so the two agree in the containment checks built on this.
const realpath = realpathSync.native;

// Canonicalize a path by realpath-resolving its deepest EXISTING ancestor and re-attaching the
// missing leaf segments. So a symlink anywhere along the path (even when the leaf itself doesn't
// exist) is resolved before containment checks.
//
// Sync on purpose — it is the KEY two concurrent launches must agree on to be recognised as
// aiming at the same directory (session/worktree-session-limit.ts), and that check happens before
// anything awaits.
export function canonicalPath(p: string): string {
  const resolved = path.resolve(p);
  const missing: string[] = [];
  let cur = resolved;
  for (;;) {
    try {
      const real = realpath(cur);
      return missing.length ? path.join(real, ...missing) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return resolved; // reached the fs root, nothing resolved
      missing.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/** Do these name the same directory, THROUGH symlinks?
 *
 * The lexical answer first, so a pair that already matched keeps matching byte for byte, then
 * the canonical one — `isSamePath` resolves `.`/`..` and Windows casing but not symlinks, and a
 * directory reached by a link (or by its physical target, or one of each) is the same directory.
 *
 * Its own function because two callers ask it of the same value: `isManagedWorkspace` compares a
 * root against `~/mulmoclaude`, `isWorkspaceRoot` against the workspace this server serves, and a
 * root that arrives from a saved preset may spell either differently.
 */
export function isSameRealPath(a: string, b: string): boolean {
  return isSamePath(a, b) || isSamePath(canonicalPath(a), canonicalPath(b));
}
