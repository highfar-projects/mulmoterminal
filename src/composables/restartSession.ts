// Restarting the agent in a cell that is already running one: reap the session, then reconnect
// the same slot to the same session id, so the server spawns a NEW process and resumes the same
// conversation (#1918). Changing an MCP registration, a config file or a plugin needs exactly
// this, and until now cost a trip back through the launcher.
//
// The order is the whole rule, and it is why this is a function rather than two lines at the call
// site. A session runs inside tmux, and reconnecting to a tmux session that is still alive
// ATTACHES it — see ptyWouldReattach in server/session/pty-spawn.ts: "on the attach path nothing
// is re-read, because nothing is re-started". So a reconnect that overtakes the reap gets the OLD
// process back, with the old config, and looks exactly like a restart that worked.
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

/** Everything the restart does to the world, injected so the ordering above can be tested. */
export interface RestartSteps {
  /** End the session server-side — pty AND tmux. Resolves to whether the server confirmed it. */
  reap: (sessionId: string) => Promise<boolean>;
  /** Point the slot at the same session again; the server has nothing live, so it spawns. */
  reconnect: () => void;
}

export type RestartOutcome =
  /** Nothing was running — a cell still on its launch form. */
  | "no-session"
  | "restarted"
  /** The reap request failed. Reconnected anyway (the old pty may already be gone), but this is
   *  the case where the new process can turn out to be the old one. */
  | "reap-unconfirmed";

export async function restartSession(sessionId: string | null, steps: RestartSteps): Promise<RestartOutcome> {
  if (!sessionId) return "no-session";
  const reaped = await steps.reap(sessionId);
  steps.reconnect();
  return reaped ? "restarted" : "reap-unconfirmed";
}

/** The close button's own route (POST /api/session/:id/terminate): it kills the pty and the tmux
 *  session, and kills a tmux session orphaned by an earlier server run even when no pty is live. */
export async function reapSessionOnServer(sessionId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`/api/session/${encodeURIComponent(sessionId)}/terminate`, { method: "POST" });
    if (!res.ok) console.warn(`[restart] terminate ${sessionId} answered HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`[restart] terminate ${sessionId} failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
