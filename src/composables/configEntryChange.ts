import { isRecord } from "../../common/isRecord";
import { isEntryProblem, type EntryProblem } from "../../common/agentEntries";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// One entry of a global list added or removed on the server, which answers the resulting list — or
// refuses with the problem it found in the list ON DISK, which can differ from the one this tab has.
export type EntryChange = { ok: true; body: Record<string, unknown> } | { ok: false; problem: EntryProblem | null };

export async function postEntryChange(route: string, payload: Record<string, unknown>): Promise<EntryChange> {
  try {
    const res = await fetchWithTimeout(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && isRecord(body)) return { ok: true, body };
    return { ok: false, problem: isRecord(body) && isEntryProblem(body.error) ? body.error : null };
  } catch {
    return { ok: false, problem: null };
  }
}
