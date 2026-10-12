// Opening a file outside every served directory in a new tab (#3024): ask the server for a one-file
// URL (common/fileGrant.ts), then send the tab there. The tab is opened FIRST, while the click still
// counts as a user gesture — a tab opened after the request comes back is what popup blockers stop.
import { FILE_GRANT_ROUTE, type FileGrantResult } from "../../common/fileGrant";
import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export async function requestFileGrant(absPath: string): Promise<FileGrantResult> {
  try {
    const res = await fetchWithTimeout(FILE_GRANT_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: absPath }),
    });
    const body: unknown = await res.json();
    if (res.ok && isRecord(body) && typeof body.url === "string") return { ok: true, url: body.url };
    return { ok: false, reason: res.status === 404 ? "missing" : "refused" };
  } catch (error) {
    console.error(`[files] could not open ${absPath} in a tab`, error);
    return { ok: false, reason: "refused" };
  }
}

/** What the tab says when there is nothing to show — written into it, since it is already open. */
export type GrantProblemText = (reason: "missing" | "refused", absPath: string) => string;

export interface GrantedTabDeps {
  openBlank: () => Window | null;
  requestGrant: (absPath: string) => Promise<FileGrantResult>;
  problemText: GrantProblemText;
  origin: string;
}

export async function openGrantedTab(absPath: string, deps: GrantedTabDeps): Promise<void> {
  const tab = deps.openBlank();
  if (!tab) return;
  // What `noopener` would have given: the file's page cannot reach back into the app.
  tab.opener = null;
  const result = await deps.requestGrant(absPath);
  if (result.ok) {
    tab.location.replace(new URL(result.url, deps.origin).href);
    return;
  }
  const text = deps.problemText(result.reason, absPath);
  tab.document.title = text;
  tab.document.body.textContent = text;
}

/** A rebased path put back together: `base` is `/`, `~/…`, `C:/…` or deeper. */
export const joinedPath = (base: string, rel: string): string => (base.endsWith("/") ? `${base}${rel}` : `${base}/${rel}`);
