// GET /api/files/browse/git-status?cwd= — which paths under the Files pane's root git sees as
// changed (#2496). Names and states only: nothing the directory listing does not already reveal
// under the same base rule, so it takes the browse routes' base.
import type { Express } from "express";
import type { FileGitStatus } from "../../common/fileGitStatus.js";
import { git } from "../git/worktrees.js";
import { parseStatusEntries } from "../git/statusEntries.js";
import { coalesceByKey } from "../infra/coalesce-by-key.js";

const NOT_A_REPO: FileGitStatus = { repo: false, files: {} };

// git escapes a non-ASCII path as C-quoted octal unless told not to; the tree names files as they are.
const QUOTE_PATH_OFF = ["-c", "core.quotePath=false"];

async function readTreeGitStatus(root: string): Promise<FileGitStatus> {
  const prefix = await git(["rev-parse", "--show-prefix"], root);
  if (!prefix.ok) return NOT_A_REPO;
  // `-- .` limits the walk to the pane's root; the paths still come back relative to the repository.
  const status = await git([...QUOTE_PATH_OFF, "status", "--porcelain=v1", "-z", "--", "."], root);
  return { repo: true, files: status.ok ? parseStatusEntries(status.stdout, prefix.stdout.trim()) : {} };
}

// One read per root at a time: every pane on one checkout polls this, and a `git status` scans the
// whole work tree — overlapping ones only make each other slower (the header's reason, #2164).
const coalesce = coalesceByKey<string, FileGitStatus>();

export function mountFilesGitStatusRoute(app: Express, deps: { base: (cwd: unknown) => string }): void {
  app.get("/api/files/browse/git-status", async (req, res) => {
    const root = deps.base(req.query.cwd);
    res.json(await coalesce(root, () => readTreeGitStatus(root)));
  });
}
