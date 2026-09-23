// Which directory a session is working in — the answer presentDocument / presentHtml's
// relative `path` is resolved against (see backends/presentPathRoot.ts).
//
// Three tiers, most-truthful first. `ptys` knows where the agent is ACTUALLY running, so
// it wins over the persisted note even when the two disagree: a cell relaunched somewhere
// else keeps its id but not its directory. The workspace fallback is what every caller
// that names no session gets — the scheduler, feeds, a direct POST — so their behaviour
// is exactly what it was before this existed.
import { devTerminalCwdsHydrated, ptys, sessionCwd } from "./registry.js";
import { CLAUDE_CWD } from "../config/env.js";

/** Pure form, for tests and for callers that already hold the facts. Empty strings are
 *  treated as "not known" — `ptys` entries are built with a `?? ""` default upstream. */
export function pickSessionCwd(facts: { livePtyCwd?: string | null | undefined; rememberedCwd?: string | null | undefined; workspace: string }): string {
  return facts.livePtyCwd || facts.rememberedCwd || facts.workspace;
}

/** The directory for a session id, falling back to the workspace when the id is absent,
 *  unknown, or was never recorded with one. */
export function cwdForSession(id: string | null | undefined): string {
  if (!id) return CLAUDE_CWD;
  return pickSessionCwd({ livePtyCwd: ptys.get(id)?.cwd, rememberedCwd: sessionCwd(id), workspace: CLAUDE_CWD });
}

/** `cwdForSession` once the remembered directories have been read off disk.
 *
 *  A route answering ABOUT a session must await this. `sessionCwds` is hydrated from a file at
 *  boot, so a request landing inside that window is told the workspace — which is the very default
 *  a session-scoped route passes its own directory to replace, and the poll behind it repeats every
 *  few seconds, so the wrong answer is the one the user sees first. Every other reader of that map
 *  waits the same way (ws-routes, surviving-sessions). */
export async function cwdForSessionHydrated(id: string | null | undefined): Promise<string> {
  await devTerminalCwdsHydrated;
  return cwdForSession(id);
}
