// Which agents this machine can start, as GET /api/agents/availability reports it (#2229). Here
// rather than in server/ because the launch pickers will read it to grey out an agent that cannot
// run, and #2230 words its install guidance from `reason`.
import { isRecord } from "./isRecord";
import { isTerminalAgent, type TerminalAgent } from "./sessionAgent";

/** Why an agent cannot be started — the kind of the spawn preflight's own diagnosis, so the advice
 *  can differ: `missing` is not installed (or not on the server's PATH), `no-such-path` is an
 *  `<AGENT>_BIN` override naming nothing, `not-executable` is a file that cannot run. */
export const AGENT_UNAVAILABLE_REASONS = ["missing", "no-such-path", "not-executable"] as const;

export type AgentUnavailableReason = (typeof AGENT_UNAVAILABLE_REASONS)[number];

// No `bin`: with an `<AGENT>_BIN` override it is a path on this machine, and nothing that reads
// this needs it — the reason already says whether an override is what failed.
export type AgentAvailability =
  | { agent: TerminalAgent; available: true }
  /** `installGuide` is the agent's official install page, or null when none is recorded (#2230). */
  | { agent: TerminalAgent; available: false; reason: AgentUnavailableReason; installGuide: string | null };

export interface AgentAvailabilityResponse {
  agents: AgentAvailability[];
}

const isUnavailableReason = (value: unknown): value is AgentUnavailableReason => AGENT_UNAVAILABLE_REASONS.some((reason) => reason === value);

function parseEntry(raw: unknown): AgentAvailability | null {
  if (!isRecord(raw) || typeof raw.agent !== "string" || !isTerminalAgent(raw.agent)) return null;
  if (raw.available === true) return { agent: raw.agent, available: true };
  if (raw.available !== false || !isUnavailableReason(raw.reason)) return null;
  return { agent: raw.agent, available: false, reason: raw.reason, installGuide: httpsUrlOrNull(raw.installGuide) };
}

// Only an https link is ever rendered: this goes into an href, and the server is the one source,
// but the page must not be the thing that trusts it.
function httpsUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

/** The response body as the browser receives it, entry by entry: a malformed entry is dropped, not
 *  the whole answer, and an agent with no entry reads as available — today's behaviour. */
export function parseAgentAvailabilityResponse(raw: unknown): AgentAvailability[] {
  if (!isRecord(raw) || !Array.isArray(raw.agents)) return [];
  return raw.agents.map(parseEntry).filter((entry): entry is AgentAvailability => entry !== null);
}
