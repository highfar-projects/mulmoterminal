// Recognising a managed worktree from its PATH alone, for the two sides that both have to.
//
// In `common/` because the launch form and `mulmoterminal init` each decide from it — the browser
// records the directory a cell launched in, the CLI seeds the same list from Claude's history — and
// a rule mirrored into `src/` and `server/` is a rule that drifts.
//
// Lexical on purpose: the browser cannot realpath, so the server's own `isManagedWorktree` (which
// does, against `git worktree list`) is not available to both callers. The `-<8hex>` suffix is
// minted by `worktreesRoot`, which is what makes reading it off the path safe enough here — the
// cost of a wrong answer is a chip offered or withheld, not a session sent somewhere.

// A managed worktree's cwd looks like .../worktrees/<repo>-<8hex>/<task> (see the server's
// worktreesRoot).
const MANAGED_DIR = /^(.+)-[0-9a-f]{8}$/;

/** The repo and task a managed worktree path names, or null for any other path. */
export function worktreeLabel(cwd: string | null): { repo: string; task: string } | null {
  if (!cwd) return null;
  const parts = cwd.split(/[/\\]/).filter(Boolean);
  const i = parts.indexOf("worktrees");
  const dir = parts[i + 1];
  const task = parts[i + 2];
  if (i < 0 || !dir || !task) return null;
  const m = MANAGED_DIR.exec(dir);
  return m?.[1] === undefined ? null : { repo: m[1], task };
}

/**
 * A managed worktree, which is NOT a working directory worth remembering.
 *
 * The chip list is auto-recorded from wherever a cell launched, and a worktree launches like
 * anywhere else — so every isolated task left one behind. But a worktree is one branch for one
 * task, deleted when that task is done: "launch here again" is the thing it is never for, and
 * nothing prunes the chip when the directory goes (the close button is the only remover), so the
 * row filled with paths that no longer exist and pushed the real projects out of reach.
 */
export const isManagedWorktreePath = (path: string): boolean => worktreeLabel(path) !== null;
