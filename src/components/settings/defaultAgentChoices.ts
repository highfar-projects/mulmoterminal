import { FALLBACK_AGENT } from "../../../common/defaultAgent";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../common/sessionAgent";
import { BUILTIN_AGENT_OPTIONS } from "../agentPicker";

// The choices Settings offers for `defaultAgent`. The start-up gate requires the declared default to
// be installed — and "not set" declares claude — so saving an agent this machine cannot start stops
// the next launch (bin/default-agent.js). A choice is therefore pickable only when the server has
// POSITIVELY said it can start that agent: not while the answer is loading, not after a failed one.
// The launch form reads the same answer the other way round, because a wrong guess there only fails
// one spawn. The current value stays enabled so the select can show it and re-picking it is a no-op.
export interface DefaultAgentChoice {
  /** `null` is "not set": a new session starts as claude, and the gate asks about claude. */
  agent: TerminalAgent | null;
  label: string | null;
  disabled: boolean;
}

const labelOf = (agent: TerminalAgent): string => BUILTIN_AGENT_OPTIONS.find((option) => option.agent === agent)?.label ?? agent;

export const defaultAgentChoices = (confirmed: ReadonlySet<TerminalAgent>, current: TerminalAgent | null): readonly DefaultAgentChoice[] => [
  { agent: null, label: null, disabled: current !== null && !confirmed.has(FALLBACK_AGENT) },
  ...TERMINAL_AGENTS.map((agent) => ({ agent, label: labelOf(agent), disabled: agent !== current && !confirmed.has(agent) })),
];

/** The `<option>` value for a choice, and back. A select's value is a string, and "not set" needs one. */
export const UNSET_AGENT_VALUE = "";
export const choiceValue = (agent: TerminalAgent | null): string => agent ?? UNSET_AGENT_VALUE;
export const agentFromChoiceValue = (value: string): TerminalAgent | null => TERMINAL_AGENTS.find((agent) => agent === value) ?? null;
