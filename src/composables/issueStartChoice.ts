// What an issue's work starts as (#2226): the agent and account the PRs & Issues view has picked.
//
// Pure, so the rules are testable without a browser: a stored agent wins over the configured
// default; a stored account survives only while it is still one of THAT agent's configured accounts.
// An account the config has since dropped, or one belonging to another agent, reads as the default
// login rather than being sent — the server would refuse it, and a refused start is worse than one
// on the login the picker is showing.
import { accountsForAgent, type AgentAccount } from "../../common/agentAccounts";
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent";

export interface IssueStartChoice {
  agent: TerminalAgent;
  account: string | null;
}

/** A remembered agent read back: only a hosted agent counts, anything else is "none stored". */
export const storedIssueAgent = (raw: string | null): TerminalAgent | null => (raw !== null && isTerminalAgent(raw) ? raw : null);

export function issueStartChoice(
  storedAgent: TerminalAgent | null,
  fallbackAgent: TerminalAgent,
  storedAccount: string | null,
  accounts: readonly AgentAccount[],
): IssueStartChoice {
  const agent = storedAgent ?? fallbackAgent;
  const account = storedAccount !== null && accountsForAgent(accounts, agent).some((entry) => entry.id === storedAccount) ? storedAccount : null;
  return { agent, account };
}
