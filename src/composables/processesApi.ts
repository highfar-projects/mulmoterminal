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

async function postJson(url: string, body: object): Promise<boolean> {
  try {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
    return (await fetchWithTimeout(url, init, SLOW_COMMAND_TIMEOUT_MS)).ok;
  } catch {
    return false;
  }
}

export const loadSessionProcesses = (): Promise<SessionProcesses[] | null> => readJson("/api/processes", readProcessesBody);

/** False when the server refused or could not be reached; the next poll shows what is true. */
export const killProcess = (process: SessionProcess): Promise<boolean> => postJson("/api/processes/kill", { pid: process.pid, startedAt: process.startedAt });

// One git call per worktree across every remembered repo: not an ordinary read.
export const loadWorktreeCleanup = (): Promise<WorktreeCleanupRow[] | null> =>
  readJson("/api/worktrees/cleanup", readWorktreeCleanupBody, SLOW_COMMAND_TIMEOUT_MS);

/** Never `force`: a worktree that turned dirty since the list was read is refused, not discarded.
 *  The branch goes with it — it is merged, which is what made the row a candidate. */
export const removeCleanupWorktree = (row: WorktreeCleanupRow): Promise<boolean> =>
  postJson("/api/worktrees/remove", { repoDir: row.repo, path: row.path, deleteBranch: true, force: false });
