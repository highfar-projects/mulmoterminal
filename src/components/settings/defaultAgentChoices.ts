import { TERMINAL_AGENTS, type TerminalAgent } from "../../../common/sessionAgent";
import { BUILTIN_AGENT_OPTIONS } from "../agentPicker";

// The choices Settings offers for `defaultAgent`. An agent this machine cannot start is offered
// DISABLED rather than left out: the start-up gate requires the declared default (bin/default-agent.js),
// so saving one that is not installed would stop the next launch — and hiding it would leave the
// reader wondering where it went.
export interface DefaultAgentChoice {
  /** `null` is "not set": a new session starts as claude, and the gate asks about claude. */
  agent: TerminalAgent | null;
  label: string | null;
  disabled: boolean;
}

const labelOf = (agent: TerminalAgent): string => BUILTIN_AGENT_OPTIONS.find((option) => option.agent === agent)?.label ?? agent;

export const defaultAgentChoices = (unavailable: ReadonlySet<TerminalAgent>): readonly DefaultAgentChoice[] => [
  { agent: null, label: null, disabled: false },
  ...TERMINAL_AGENTS.map((agent) => ({ agent, label: labelOf(agent), disabled: unavailable.has(agent) })),
];

/** The `<option>` value for a choice, and back. A select's value is a string, and "not set" needs one. */
export const UNSET_AGENT_VALUE = "";
export const choiceValue = (agent: TerminalAgent | null): string => agent ?? UNSET_AGENT_VALUE;
export const agentFromChoiceValue = (value: string): TerminalAgent | null => TERMINAL_AGENTS.find((agent) => agent === value) ?? null;
