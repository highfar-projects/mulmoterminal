// Keep a file WE write out of the user's `git status`, through `.git/info/exclude` rather than
// their `.gitignore`: these are local switches on a local machine, so they must not turn up in a
// diff or be pushed to their team — the same reason claude's MCP registration uses `-s local`
// scope (infra/gui-mcp-registration.ts).
//
// Shared by the agents whose GUI MCP registration lands INSIDE the project: agy's
// `.agents/mcp_config.json` and grok's `.grok/config.toml`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Add `entry` to this repo's `.git/info/exclude`, if there is one. Idempotent.
 *
 * Only when `.git/info` is really there: a worktree or a submodule keeps `.git` as a FILE pointing
 * elsewhere, and a session can also run in a directory below the repo root, where this path means
 * nothing. Both are left alone rather than guessed at — the cost is a line in `git status`, not a
 * broken session.
 */
export function excludeFromGit(cwd: string, entry: string): void {
  const exclude = path.join(cwd, ".git", "info", "exclude");
  try {
    if (!existsSync(path.dirname(exclude))) return;
    const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
    if (current.split("\n").includes(entry)) return;
    writeFileSync(exclude, current + (current === "" || current.endsWith("\n") ? "" : "\n") + entry + "\n", "utf8");
  } catch {
    // Not ours to insist on. The config itself is already written; this only affects tidiness.
  }
}
