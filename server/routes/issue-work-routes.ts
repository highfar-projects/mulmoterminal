// POST /api/issues/start — begin work on a GitHub issue (#1173). Cuts the issue's worktree and
// spawns a session in it seeded with the issue, so the `/prs` issue list stops being somewhere to
// read and becomes somewhere to start. `agent` picks which one (#2228); absent, it is Claude.
//
// A write (it creates a branch, a directory and a process), so it is same-origin guarded like the
// other local-only mutations.
import type { Express } from "express";
import { getCwdPresets, getRepoDirs } from "../config/config-routes.js";
import { repoDirsFromPresets } from "../git/repo-dirs.js";
import { startIssueWork } from "../git/issue-work.js";
import { requestedIssueAgent, type SpawnIssueSession } from "../session/issue-session-spawn.js";
import { isIssueNumber } from "../../common/prPhase.js";
import { isRepoEntry, repoIdentity } from "../../common/repoEntry.js";
import { requestOriginAllowed } from "./same-origin-guard.js";
import { requestBody } from "./requestBody.js";

export interface IssueWorkRouteDeps {
  spawnIssueSession: SpawnIssueSession;
  isAllowedOrigin: (origin: string | undefined, remoteAddress: string | undefined) => boolean;
}

// A failure the caller can act on (pick another clone, check the issue number, close the terminal
// holding the worktree) is a 409; a repo or directory that is not theirs to name is a 403.
const STATUS_FOR_REASON: Record<string, number> = { "issue-not-found": 409, "worktree-busy": 409, "worktree-failed": 500 };

export function mountIssueWorkRoutes(app: Express, deps: IssueWorkRouteDeps): void {
  app.post("/api/issues/start", async (req, res) => {
    if (!requestOriginAllowed(req, deps.isAllowedOrigin)) return res.status(403).end();
    const body = requestBody(req.body);
    const { repo, issue, dir } = body;
    if (typeof repo !== "string" || !isRepoEntry(repo) || !isIssueNumber(issue) || typeof dir !== "string") {
      return res.status(400).json({ error: "repo ([host/]owner/repo), a positive issue number and dir are required" });
    }
    const agent = requestedIssueAgent(body.agent);
    if (agent === null) return res.status(400).json({ error: "agent must be one of the hosted agents, or left out for claude" });
    // The entry is carried on AS CONFIGURED, host and all. Stripping it here made the layer below
    // read `isamu1/node-test` as a GitHub repo and look for an issue that does not exist there —
    // the host is what says which forge to ask. It comes off at the CLI boundary, not before.

    // `dir` arrives from the browser but becomes a spawn's working directory, so it is not taken
    // on trust: it has to be one of the clones the server itself resolved for THIS repo. Without
    // the check, a request could start an agent in any directory on the machine — and in one that
    // has nothing to do with the issue being claimed.
    const known = await repoDirsFromPresets(getCwdPresets(), getRepoDirs());
    const entry = known.find((r) => repoIdentity(r.repo) === repoIdentity(repo));
    if (!entry?.dirs.some((d) => d.path === dir)) {
      return res.status(403).json({ error: `${dir} is not a known clone of ${repo}` });
    }

    const result = await startIssueWork(repo, issue, dir, {
      // run:false — the desktop leaves a Claude seed in the input box. The issue text was written by
      // whoever opened it, who is often not the person about to run it, so the Enter is theirs. The
      // phone passes true (#1253): it has no Enter key. Other agents run it either way.
      spawnSeeded: (cwd, seed) => deps.spawnIssueSession(agent, cwd, seed, false),
    });

    if (!result.ok) return res.status(STATUS_FOR_REASON[result.reason ?? ""] ?? 500).json(result);
    res.json(result);
  });
}
