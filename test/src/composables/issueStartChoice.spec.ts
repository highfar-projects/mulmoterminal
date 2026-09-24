// What an issue's work starts as (#2226). A stored account survives only while it is one of the
// picked agent's configured accounts — anything else is the default login, not a refused start.
import { describe, it, expect } from "vitest";
import { issueStartChoice, storedIssueAgent } from "../../../src/composables/issueStartChoice";
import { TERMINAL_AGENTS } from "../../../common/sessionAgent";
import type { AgentAccount } from "../../../common/agentAccounts";

const ACCOUNTS: AgentAccount[] = [
  { id: "work", label: "Work", agent: "claude", home: "~/.claude-work" },
  { id: "side", label: "Side", agent: "codex", home: "~/.codex-side" },
];

describe("issueStartChoice", () => {
  it("follows the configured default until an agent is stored", () => {
    expect(issueStartChoice(null, "codex", null, ACCOUNTS)).toEqual({ agent: "codex", account: null });
    expect(issueStartChoice("grok", "codex", null, ACCOUNTS)).toEqual({ agent: "grok", account: null });
  });

  it("keeps a stored account that belongs to the picked agent", () => {
    expect(issueStartChoice("claude", "claude", "work", ACCOUNTS)).toEqual({ agent: "claude", account: "work" });
    expect(issueStartChoice("codex", "claude", "side", ACCOUNTS)).toEqual({ agent: "codex", account: "side" });
  });

  it.each<[string, string | null, string]>([
    ["another agent's account", "claude", "side"],
    ["an account the config dropped", "claude", "gone"],
    ["an account on an agent accounts cannot move", "grok", "work"],
  ])("reads %s as the default login", (_case, agent, account) => {
    expect(issueStartChoice(storedIssueAgent(agent), "claude", account, ACCOUNTS).account).toBeNull();
  });
});

describe("storedIssueAgent", () => {
  it.each(TERMINAL_AGENTS)("reads %s back", (agent) => {
    expect(storedIssueAgent(agent)).toBe(agent);
  });

  it.each([null, "", "shell", "gemini", "Claude"])("reads %j as nothing stored", (raw) => {
    expect(storedIssueAgent(raw)).toBeNull();
  });
});
