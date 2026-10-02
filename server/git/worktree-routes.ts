// HTTP routes for per-agent git worktree isolation (see worktrees.ts). The launcher
// uses these to detect a git repo, list/reuse existing worktrees, and create/remove
// them. Mutations are same-origin guarded like the other local-only routes; remove
// uses POST (not DELETE) so a request body survives every proxy.
import os from "node:os";
import type { Express } from "express";
import { repoRoot, defaultBaseBranch, listWorktrees, createWorktree, removeWorktree, isDirty } from "./worktrees.js";
import { releaseWorktreeEnv } from "../config/worktree-env.js";
import { worktreeDiff } from "./worktree-diff.js";
import { pushWorktree, createOrOpenPR } from "./worktree-pr.js";
import { requestOriginAllowed } from "../routes/same-origin-guard.js";
import { isIssueNumber } from "../../common/prPhase.js";
import { dirSession, survivorSnapshot } from "../session/dir-session.js";
import { tmuxAttachedCounts } from "../infra/tmux.js";
import { requestBody } from "../routes/requestBody.js";
import { expandTilde } from "../files/pathContainment.js";
import { cleanupRowAt, worktreeCleanupRows } from "./worktree-cleanup.js";
import { cleanupBlockers } from "../../common/worktreeCleanup.js";
import { rememberedSessionCwds } from "../session/registry.js";

interface WorktreeRouteOptions {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
  homeDir?: string;
}

// A failed git/gh command is a 500; a precondition the user can fix (no remote, not
// a GitHub repo, …) is a 409. Mirrors the create/remove status convention.
const SERVER_ERROR_REASONS = new Set(["failed", "push-failed"]);
function statusFor(result: { ok: boolean; reason?: string | undefined }): number {
  if (result.ok) return 200;
  return SERVER_ERROR_REASONS.has(result.reason ?? "") ? 500 : 409;
}

// The launch form sends the directory as typed, so `~/repo` must name the same repo the cell
// spawns in (workspaceRequest expands it the same way).
const homeExpander =
  (homeDir: string) =>
  (dir: string): string =>
    expandTilde(dir, homeDir);

async function worktreeListing(cwd: string) {
  const repo = cwd ? await repoRoot(cwd) : null;
  if (!repo) return { isGit: false, base: null, worktrees: [] };
  const list = await listWorktrees(repo);
  const tmuxCounts = tmuxAttachedCounts();
  const running = await survivorSnapshot();
  const now = Date.now();
  const worktrees = await Promise.all(
    list.map(async (w) => ({ ...w, dirty: await isDirty(w.path), session: await dirSession(w.path, tmuxCounts, now, running) })),
  );
  return { isGit: true, base: await defaultBaseBranch(repo), worktrees };
}

// The Processes page's worktree list (#2219) and its removal.
function mountWorktreeCleanupRoutes(app: Express, isAllowedOrigin: WorktreeRouteOptions["isAllowedOrigin"], fromHome: (dir: string) => string): void {
  // Every managed worktree of the repos terminals have run in, with what keeps each from being
  // removed (#2219). Read-only; removal is the route below, which reads the worktree again.
  app.get("/api/worktrees/cleanup", async (_req, res) => {
    res.json({ worktrees: await worktreeCleanupRows(await rememberedSessionCwds()) });
  });

  // Remove a cleanup candidate and its branch. Every condition that made it a candidate is read
  // again here, not trusted from the list: a commit made since would otherwise go with `branch -D`,
  // and a terminal that has moved in would lose its directory. 409 names what now holds it.
  app.post("/api/worktrees/cleanup/remove", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const { repoDir, path: worktreePath } = requestBody(req.body);
    if (typeof repoDir !== "string" || typeof worktreePath !== "string") {
      return res.status(400).json({ error: "repoDir and path are required" });
    }
    const row = await cleanupRowAt(fromHome(repoDir), fromHome(worktreePath));
    if (row === null) return res.status(404).json({ error: "not a managed worktree" });
    const blockers = cleanupBlockers(row);
    if (blockers.length > 0) return res.status(409).json({ blockers });
    const result = await removeWorktree(row.repo, row.path, { deleteBranch: true });
    if (!result.ok) return res.status(result.reason === "failed" ? 500 : 409).json(result);
    releaseWorktreeEnv(row.path);
    return res.json(result);
  });
}

export function mountWorktreeRoutes(app: Express, { isAllowedOrigin, homeDir = os.homedir() }: WorktreeRouteOptions): void {
  const fromHome = homeExpander(homeDir);
  // Repo status + the managed worktrees for a cell's chosen dir (each with `dirty`
  // so the UI can confirm before deleting). A non-git dir is `isGit:false`, not an
  // error — the launcher just hides the worktree UI.
  //
  // `session` is what makes a worktree row one of start / resume / refuse (#1207): a worktree is
  // one branch, so it gets one session, and the row must not offer to start a second agent in a
  // working tree somebody is already in. Both inputs are read ONCE for the whole list — a
  // per-row tmux probe would be one process spawn per worktree.
  app.get("/api/worktrees", async (req, res) => {
    res.json(await worktreeListing(typeof req.query.cwd === "string" ? fromHome(req.query.cwd) : ""));
  });

  // Read-only diff of a worktree vs its base branch (ahead/dirty counts + changed
  // files + patch), so a cell can show what the agent changed. A non-worktree dir
  // is `isWorktree:false`, not an error.
  app.get("/api/worktrees/diff", async (req, res) => {
    const cwd = typeof req.query.cwd === "string" ? fromHome(req.query.cwd) : "";
    res.json(cwd ? await worktreeDiff(cwd) : { isWorktree: false, base: null, ahead: 0, dirty: 0, files: [], patch: "", truncated: false });
  });

  mountWorktreeCleanupRoutes(app, isAllowedOrigin, fromHome);

  app.post("/api/worktrees/create", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const { repoDir, task, issue } = requestBody(req.body);
    if (typeof repoDir !== "string" || typeof task !== "string" || !task.trim()) {
      return res.status(400).json({ error: "repoDir and a non-empty task are required" });
    }
    // An unusable `issue` is refused rather than dropped: the number ends up in the branch name
    // and from there in the PR's `Fixes`, so silently creating an UNANCHORED worktree would look
    // like it worked and only diverge later, once nothing closes the issue.
    if (issue !== undefined && !isIssueNumber(issue)) {
      return res.status(400).json({ error: "issue must be a positive integer" });
    }
    const wt = await createWorktree(fromHome(repoDir), task, issue);
    if (!wt) return res.status(500).json({ error: "could not create the worktree (is this a git repo?)" });
    res.json(wt);
  });

  // Remove a managed worktree. 409 for a client-resolvable conflict (dirty → the UI
  // re-confirms with `force`; not-managed → a bad path), 500 for an internal git
  // failure the client can't fix by retrying.
  app.post("/api/worktrees/remove", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const { repoDir, path: worktreePath, deleteBranch, force } = requestBody(req.body);
    if (typeof repoDir !== "string" || typeof worktreePath !== "string") {
      return res.status(400).json({ error: "repoDir and path are required" });
    }
    const worktreeDir = fromHome(worktreePath);
    // Strict `=== true` (not `!!`) for the destructive flags: a mistyped truthy
    // payload (e.g. the string "false") must fall back to the SAFE default — never
    // force-remove a dirty worktree or delete a branch on a malformed request.
    const result = await removeWorktree(fromHome(repoDir), worktreeDir, { deleteBranch: deleteBranch === true, force: force === true });
    // Only once the removal succeeded, and from here rather than inside removeWorktree: releasing
    // a port a worktree is still using would hand it to the next tree while a dev server holds it.
    if (result.ok) {
      releaseWorktreeEnv(worktreeDir);
      return res.json(result);
    }
    res.status(result.reason === "failed" ? 500 : 409).json(result);
  });

  // Push the worktree's branch to origin (the first half of "取り込み").
  app.post("/api/worktrees/push", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const { cwd } = requestBody(req.body);
    if (typeof cwd !== "string") return res.status(400).json({ error: "cwd is required" });
    const result = await pushWorktree(fromHome(cwd));
    res.status(statusFor(result)).json(result);
  });

  // Push, then create a PR via gh — or fall back to the GitHub compare URL. The body
  // returns the URL for the client to open and which path produced it (`via`).
  app.post("/api/worktrees/pr", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    const { cwd } = requestBody(req.body);
    if (typeof cwd !== "string") return res.status(400).json({ error: "cwd is required" });
    const result = await createOrOpenPR(fromHome(cwd));
    res.status(statusFor(result)).json(result);
  });
}
