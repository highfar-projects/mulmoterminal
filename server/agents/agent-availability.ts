// Which hosted agents this machine can start (#2229), asked the way the spawn asks it.
//
// The answer is the spawn preflight's own: pty-spawn.ts refuses a spawn whose binary
// diagnoseBinary cannot vouch for, so an agent reported available here is one whose spawn will not
// be refused for its binary, and the reverse. Nothing is executed — the check is a lookup.
import { TERMINAL_AGENTS, type TerminalAgent } from "../../common/sessionAgent.js";
import type { AgentAvailability } from "../../common/agentAvailability.js";
import type { BinaryDiagnosis } from "../infra/has-binary.js";

/** One entry per hosted agent, in TERMINAL_AGENTS order. `bins` is keyed by every agent, so a new
 *  one is a type error at the caller rather than an agent this report silently leaves out. Only the
 *  diagnosis KIND leaves: the bin, the path it resolved to and the PATH searched stay here. */
export function agentAvailability(
  bins: Readonly<Record<TerminalAgent, string>>,
  diagnose: (bin: string) => BinaryDiagnosis,
  installGuide: (agent: TerminalAgent) => string | null,
): AgentAvailability[] {
  return TERMINAL_AGENTS.map((agent) => {
    const diagnosis = diagnose(bins[agent]);
    return diagnosis.kind === "ok" ? { agent, available: true } : { agent, available: false, reason: diagnosis.kind, installGuide: installGuide(agent) };
  });
}
