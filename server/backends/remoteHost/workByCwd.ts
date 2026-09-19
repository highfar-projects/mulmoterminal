// What each session's directory is working on. Resolved once per DIRECTORY rather than per
// session: the row builder's `detailOf` is synchronous, and cells sharing a checkout share an
// answer (#1014). phaseForRepoBranch caches per (repo, branch), so a grid of twenty cells costs a
// handful of gh calls at most, and none at all between polls inside the TTL.
import { gitStatus } from "../../git/git-status.js";
import { phaseForRepoBranch } from "../../git/prPhase.js";
import { repoForDir } from "../../git/forge-support.js";
import { sessionWorkSummary, type SessionWorkSummary } from "./terminalScreen.js";

const summaryFor = async (cwd: string): Promise<SessionWorkSummary | undefined> => {
  const status = await gitStatus(cwd);
  if (!status.repo || !status.branch) return undefined;
  const repo = (await repoForDir(cwd))?.repo ?? null;
  if (!repo) return undefined;
  return sessionWorkSummary(await phaseForRepoBranch(repo, status.branch));
};

/** Directory -> work item, for the directories that have one. Best-effort: a directory that cannot
 *  be resolved simply carries no work item. */
export async function workByCwd(cwds: readonly string[]): Promise<Map<string, SessionWorkSummary>> {
  const out = new Map<string, SessionWorkSummary>();
  await Promise.all(
    [...new Set(cwds.filter((cwd) => cwd !== ""))].map(async (cwd) => {
      try {
        const summary = await summaryFor(cwd);
        if (summary) out.set(cwd, summary);
      } catch {
        // best-effort: a directory that cannot be resolved simply carries no work item
      }
    }),
  );
  return out;
}
