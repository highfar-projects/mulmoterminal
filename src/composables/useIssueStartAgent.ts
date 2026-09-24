import { computed, ref } from "vue";
import type { TerminalAgent } from "../../common/sessionAgent";
import { accountsForAgent } from "../../common/agentAccounts";
import { defaultAgent } from "./defaultAgent";
import { useAppConfig } from "./useAppConfig";
import { issueStartChoice, storedIssueAgent, type IssueStartChoice } from "./issueStartChoice";

// The agent and account the PRs & Issues view starts an issue's work in (#2226), per browser like
// the chat launcher's pick — but in keys of its own: choosing Codex for issue work must not change
// what a collection chat runs as.
//
// Until the user picks, the agent FOLLOWS the configured default, which arrives over HTTP after
// this module loads (see launchAgentPick.ts for why a sampled value is wrong).
const AGENT_KEY = "mt-issue-start-agent";
const ACCOUNT_KEY = "mt-issue-start-account";

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeKey = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still holds for this page, it just is not remembered.
  }
};

const storedAgent = ref<TerminalAgent | null>(storedIssueAgent(readKey(AGENT_KEY)));
const storedAccount = ref<string | null>(readKey(ACCOUNT_KEY));

export function useIssueStartAgent() {
  const { accounts } = useAppConfig();
  // defaultAgent() reads the configured ref, so the computed follows it once /api/config lands.
  const choice = computed(() => issueStartChoice(storedAgent.value, defaultAgent(), storedAccount.value, accounts.value));
  const accountChoices = computed(() => accountsForAgent(accounts.value, choice.value.agent));

  /** A new agent starts on its default login: an account belongs to one agent, never the next. */
  const chooseAgent = (agent: TerminalAgent): void => {
    storedAgent.value = agent;
    storedAccount.value = null;
    writeKey(AGENT_KEY, agent);
    writeKey(ACCOUNT_KEY, null);
  };
  const chooseAccount = (account: string | null): void => {
    storedAccount.value = account;
    writeKey(ACCOUNT_KEY, account);
  };
  return { choice, accountChoices, chooseAgent, chooseAccount };
}

/** The pick as it stands, for the request itself: read at click time, never captured earlier. */
export function currentIssueStartChoice(): IssueStartChoice {
  return issueStartChoice(storedAgent.value, defaultAgent(), storedAccount.value, useAppConfig().accounts.value);
}

/** Test seam: forget the stored pick. Not used by the app. */
export function resetIssueStartAgent(): void {
  storedAgent.value = null;
  storedAccount.value = null;
}
