// What ONE cockpit roster row shows, assembled from the four things the grid keeps per cell.
//
// Out of GridView for the reason `rosterAgent` next door is: this is a pure data transformation
// over state the component happens to hold, and a row that says the wrong thing is invisible in a
// component test but obvious in a table of inputs and outputs.
//
// The four lookups are passed rather than imported because each is a DIFFERENT key: the meta is
// per session, the chrome and the phase are per directory (cells sharing a directory share one
// fetch), and the status is per cell. Handing them in as functions is what lets this stay pure
// while the caller keeps its reactive maps.
import { AGENT_TITLE_MAX } from "../../common/agentTitle";
import type { Cell } from "./gridTabs";
import type { CockpitRow } from "./TerminalGrid.vue";
import type { AttentionStatus } from "./attentionStatus";
import { rosterAgent } from "./rosterAgent";
import { EMPTY_SESSION_META, type PrPhase, type SessionMetaView } from "./rosterPhase";

/** The directory's own look, as the roster row and the filmstrip thumbnail both wear it. */
export interface RowChrome {
  headerColor: string | null;
  headerTextColor: string | null;
  iconUrl: string | null;
}

// "Nothing known yet" is resolved ONCE per lookup rather than per field. Five of the row's fields
// come out of the meta and three out of the chrome, so a `??` on each both crossed the complexity
// limit and made every field independently defaultable — which is how a field the roster never
// wired up reads as a legitimate null rather than failing to typecheck.
const NO_CHROME: RowChrome = { headerColor: null, headerTextColor: null, iconUrl: null };
const NO_PR_PHASE: PrPhase = "none";
const NO_STATUS: AttentionStatus = "idle";

export interface RosterLookups {
  meta: (session: string) => SessionMetaView | undefined;
  chrome: (cwd: string) => RowChrome | undefined;
  phase: (cwd: string) => PrPhase | undefined;
  status: (uid: number) => AttentionStatus | undefined;
}

/** A cell with no session/prompt yet still gets a human label from what it IS running. */
export const fallbackLabel = (c: Cell): string | null => c.command?.label ?? c.launcher?.label ?? (c.session ? "starting…" : "empty");

/** Would the store label just restate the prompt line beneath it?
 *
 *  codex's, cursor's, agy's and grok's label IS the session's opening prompt, so a session that has
 *  had ONE turn has the same text in both rows — and a cell somebody just started is exactly the
 *  state the roster is watched in. Spending one of three rows to say a thing twice makes a scanning
 *  surface worse, so the fallback stands down when it adds nothing.
 *
 *  TWO conditions, and the second is what keeps a real opening on screen. The prompt row must start
 *  with the shown summary — the reverse direction hides a summary that says MORE (round 2) — AND
 *  the summary must be the WHOLE prompt, either exactly or because WE cut it at `AGENT_TITLE_MAX`.
 *  A summary that is merely a shorter sentence sharing an opening is a different turn and stays:
 *  "Fix parser" under a current prompt of "Fix parser and add tests" is the session's actual
 *  beginning, and suppressing it was Codex's round-4 finding.
 *
 *  Claude's `aiTitle` never reaches this: it is a summary rather than a quote of the prompt. */
const restatesThePrompt = (summary: string, prompt: string | null): boolean => {
  const flat = (text: string): string => text.replace(/\s+/g, " ").trim();
  const [shown, promptRow] = [flat(summary), flat(prompt ?? "")];
  if (shown === "" || promptRow === "" || !promptRow.startsWith(shown)) return false;
  return shown.length === promptRow.length || shown.length >= AGENT_TITLE_MAX;
};

/** The store label, unless it would only restate the prompt row. */
const agentSummary = (agentTitle: string | null, prompt: string | null): string | null =>
  agentTitle !== null && restatesThePrompt(agentTitle, prompt) ? null : agentTitle;

export function rosterRow(c: Cell, look: RosterLookups): CockpitRow {
  const meta = (c.session ? look.meta(c.session) : undefined) ?? EMPTY_SESSION_META;
  const chrome = (c.cwd ? look.chrome(c.cwd) : undefined) ?? NO_CHROME;
  return {
    uid: c.uid,
    cwd: c.cwd,
    agent: rosterAgent(c),
    status: look.status(c.uid) ?? NO_STATUS,
    memo: meta.memo,
    // Claude's AI title first, then what the agent's own store calls the session (#2123). The two
    // answer the same question — on the default title source claude's is written ONCE and never
    // updated, so that row is already "what this session was about near its beginning", which is
    // what the other agents' opening prompt is. `aiTitle` is null for every non-claude agent and
    // `agentTitle` is null for claude, so the `??` is a merge of two disjoint sources, not a
    // preference between two answers for the same cell.
    summary: meta.aiTitle ?? agentSummary(meta.agentTitle, meta.lastPrompt),
    prompt: meta.lastPrompt,
    response: meta.lastResponse,
    fallback: fallbackLabel(c),
    phase: (c.cwd ? look.phase(c.cwd) : undefined) ?? NO_PR_PHASE,
    workPhase: meta.workPhase,
    collection: meta.collection,
    headerColor: chrome.headerColor,
    headerTextColor: chrome.headerTextColor,
    iconUrl: chrome.iconUrl,
    parked: c.parked === true,
  };
}
