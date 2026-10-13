// The server's copy of a session's open checklist (#3022): read back after a reload, dropped once it is
// sent or put away (server/routes/pane-tool-routes.ts).
import { isRecord } from "../../common/isRecord";
import { isPaneCommand, type PaneCheck } from "../../common/paneCommand";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

const checkUrl = (sessionId: string): string => `/api/pane/check/${encodeURIComponent(sessionId)}`;

export async function fetchOpenCheck(sessionId: string): Promise<PaneCheck | null> {
  try {
    const res = await fetchWithTimeout(checkUrl(sessionId));
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isRecord(body) && isPaneCommand(body.check) && body.check.kind === "check" ? body.check : null;
  } catch {
    return null;
  }
}

export async function postCheckClosed(sessionId: string, id: string): Promise<void> {
  try {
    await fetchWithTimeout(`${checkUrl(sessionId)}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
  } catch (error) {
    console.error(`[pane] could not close check ${id} for ${sessionId}`, error);
  }
}
