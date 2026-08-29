// HTTP routes for devcontainer support (see devcontainer-flag.ts): checking whether a directory
// has one and is already using it, and building + starting it on request. Not worktree-specific —
// works for any directory this app can already reach a git repo from, a worktree or a plain
// checkout alike (worktreeRepoRootMount, used by runDevcontainerUp, doesn't care which).
import type { Express, Request, Response } from "express";
import { repoRoot } from "../git/worktrees.js";
import { hasDevcontainerConfig, markDevcontainerEnabled, runDevcontainerUp, runningDevcontainerName } from "./devcontainer-flag.js";
import { loadDirConfig } from "./dir-config.js";
import { requestOriginAllowed } from "../routes/same-origin-guard.js";
import { requestBody } from "../routes/requestBody.js";

interface DevcontainerRouteOptions {
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
}

// Whether `cwd` has a devcontainer config at all, and whether it's already the one every session
// there runs through (see spawn-claude.ts) — so the launcher knows both whether to offer building
// it and whether to skip that offer because a previous session here already did.
//
// `containerName` rides the same response rather than a route of its own: every caller of this
// one already has `cwd` in hand and asks it before anything devcontainer-shaped renders, so a
// second round trip just to name what `enabled: true` already implied would be asking twice for
// one fact. Looked up only when enabled — a `docker ps` nobody will read is a cost this route
// otherwise pays on every directory, devcontainer or not.
async function handleStatus(req: Request, res: Response): Promise<void> {
  const cwd = typeof req.query.cwd === "string" ? req.query.cwd : "";
  if (!cwd) {
    res.json({ hasConfig: false, enabled: false, containerName: null });
    return;
  }
  const enabled = loadDirConfig(cwd).devcontainer === true;
  res.json({ hasConfig: hasDevcontainerConfig(cwd), enabled, containerName: enabled ? await runningDevcontainerName(cwd) : null });
}

// Build and start `cwd`'s devcontainer, then mark it so every later spawn there (spawn-claude.ts)
// runs through `devcontainer exec` instead of the host. Guarded to an actual git repo — this
// shells out to Docker, so an arbitrary filesystem path is not something to accept on request; a
// worktree or a plain checkout both work equally (see worktreeRepoRootMount). Slow (a cold image
// build can run minutes): the caller is expected to wait it out, not poll.
async function handleUp(req: Request, res: Response): Promise<void> {
  const { cwd } = requestBody(req.body);
  if (typeof cwd !== "string" || !cwd) {
    res.status(400).json({ error: "cwd is required" });
    return;
  }
  if (!(await repoRoot(cwd))) {
    res.status(409).json({ ok: false, error: "not a git repository" });
    return;
  }
  if (!hasDevcontainerConfig(cwd)) {
    res.status(409).json({ ok: false, error: "no .devcontainer config here" });
    return;
  }
  const result = await runDevcontainerUp(cwd);
  if (result.ok) markDevcontainerEnabled(cwd, result.workspaceFolder);
  res.status(result.ok ? 200 : 500).json(result);
}

export function mountDevcontainerRoutes(app: Express, { isAllowedOrigin }: DevcontainerRouteOptions): void {
  app.get("/api/devcontainer/status", (req, res) => {
    void handleStatus(req, res);
  });

  app.post("/api/devcontainer/up", async (req, res) => {
    if (!requestOriginAllowed(req, isAllowedOrigin)) return res.status(403).end();
    await handleUp(req, res);
  });
}
