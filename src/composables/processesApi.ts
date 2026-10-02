// The Processes page's calls to the server (#2219). `null` from a read is "could not read it", which
// the page shows as a failure rather than as an empty list.
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "../utils/fetchWithTimeout";
import { readProcessesBody, type SessionProcess, type SessionProcesses } from "../../common/sessionProcesses";
import { readWorktreeCleanupBody, type WorktreeCleanupRow } from "../../common/worktreeCleanup";

async function readJson<T>(url: string, read: (body: unknown) => T | null, timeout_ms?: number): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, {}, timeout_ms);
    return res.ok ? read(await jsonBody(res)) : null;
  } catch {
    return null;
  }
}

async function post(url: string, body: object): Promise<Response | null> {
  try {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    return await fetchWithTimeout(url, init, SLOW_COMMAND_TIMEOUT_MS);
  } catch {
    return null;
  }
}

export const loadSessionProcesses = (): Promise<SessionProcesses[] | null> => readJson("/api/processes", readProcessesBody);

/** "unconfirmed" is the server signalling the process but unable to see it go — `ps` stopped
 *  answering, or it outlived SIGKILL. */
export type KillOutcome = "ended" | "unconfirmed" | "failed";

export async function killProcess(process: SessionProcess): Promise<KillOutcome> {
  const res = await post("/api/processes/kill", { pid: process.pid, startedAt: process.startedAt });
  if (res === null || !res.ok) return "failed";
  return (await jsonBody(res)).ended === true ? "ended" : "unconfirmed";
}

// One git call per worktree across every remembered repo: not an ordinary read.
export const loadWorktreeCleanup = (): Promise<WorktreeCleanupRow[] | null> =>
  readJson("/api/worktrees/cleanup", readWorktreeCleanupBody, SLOW_COMMAND_TIMEOUT_MS);

/** The server reads the worktree again and refuses unless it is still a candidate, so a commit or a
 *  terminal since the list was read keeps it. The branch goes with it while it is still merged. */
export async function removeCleanupWorktree(row: WorktreeCleanupRow): Promise<boolean> {
  const confirmed = { ignored: row.ignored, ignoredCount: row.ignoredCount };
  return (await post("/api/worktrees/cleanup/remove", { repoDir: row.repo, path: row.path, ...confirmed }))?.ok === true;
}
