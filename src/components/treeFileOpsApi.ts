// The tree's file operations on the wire (#2578), each answered as a value: the path the entry now
// has, or the server's own words for why not.
import { jsonBody } from "../jsonBody";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export type TreeOpRoute = "create" | "rename" | "trash";
export type TreeOpOutcome = { ok: true; path: string | null } | { ok: false; message: string };

export async function treeOp(route: TreeOpRoute, query: string, body: Record<string, unknown>): Promise<TreeOpOutcome> {
  try {
    const res = await fetchWithTimeout(`/api/files/browse/${route}?${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await jsonBody(res);
    if (!res.ok) return { ok: false, message: typeof data.error === "string" ? data.error : `HTTP ${res.status}` };
    return { ok: true, path: typeof data.path === "string" ? data.path : null };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Whether this machine has a Trash the server knows. Where it does not, the tree offers no delete. */
export async function trashAvailable(): Promise<boolean> {
  try {
    const data = await jsonBody(await fetchWithTimeout("/api/files/browse/trash"));
    return data.available === true;
  } catch {
    return false;
  }
}
