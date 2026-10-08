import { isRecord } from "../../common/isRecord";
import type { EntryProblem } from "../../common/agentEntries";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

// One entry of a global list added or removed on the server, which answers the resulting list — or
// refuses with the problem it found in the list ON DISK, which can differ from the one this tab has.
// Each list has its own problem words; `isProblem` says which ones a refusal may carry.
// A refusal keeps its body too: some carry the list as it now stands, for the caller to show.
export type EntryChange<P extends string = EntryProblem> =
  { ok: true; body: Record<string, unknown> } | { ok: false; problem: P | null; body: Record<string, unknown> | null };

export async function postEntryChange<P extends string = EntryProblem>(
  route: string,
  payload: Record<string, unknown>,
  isProblem: (value: unknown) => value is P,
): Promise<EntryChange<P>> {
  try {
    const res = await fetchWithTimeout(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && isRecord(body)) return { ok: true, body };
    if (!isRecord(body)) return { ok: false, problem: null, body: null };
    return { ok: false, problem: isProblem(body.error) ? body.error : null, body };
  } catch {
    return { ok: false, problem: null, body: null };
  }
}
