// Which agents this machine can start, as GET /api/agents/availability reports it (#2229). Here
// rather than in server/ because the launch pickers will read it to grey out an agent that cannot
// run, and #2230 words its install guidance from `reason`.
import type { TerminalAgent } from "./sessionAgent";

/** Why an agent cannot be started — the kind of the spawn preflight's own diagnosis, so the advice
 *  can differ: `missing` is not installed (or not on the server's PATH), `no-such-path` is an
 *  `<AGENT>_BIN` override naming nothing, `not-executable` is a file that cannot run. */
export const AGENT_UNAVAILABLE_REASONS = ["missing", "no-such-path", "not-executable"] as const;

export type AgentUnavailableReason = (typeof AGENT_UNAVAILABLE_REASONS)[number];

export type AgentAvailability =
  { agent: TerminalAgent; bin: string; available: true } | { agent: TerminalAgent; bin: string; available: false; reason: AgentUnavailableReason };

export interface AgentAvailabilityResponse {
  agents: AgentAvailability[];
}
