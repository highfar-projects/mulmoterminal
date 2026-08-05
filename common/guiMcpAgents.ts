// Which agents are handed the WHOLE GUI MCP — every tool on one generated `mt` URL — when their
// session runs in the workspace, and which reach GUI tools only through what their directory
// registered.
//
// In `common/` because BOTH sides decide from it and neither can derive it: the server decides it
// by which spawn path consults `carriesFullGuiMcp`, and the launcher form decides from it whether
// to state "All of them, automatically" or to offer the four per-group toggles. While the agent
// dimension lived only in the server — implicit in which file called what — the form could not ask,
// so it asked the DIRECTORY alone and told an Antigravity session in the workspace that it had
// every tool while hiding the only control that could have given it any (#1423).
//
// Antigravity is out for a structural reason, not an oversight: it reaches MCP through a config
// FILE it reads for itself (`syncAntigravityMcpConfig` writes the registered group servers into the
// directory), so there is no per-spawn `--mcp-config` to hand it a session-scoped URL. Claude takes
// that URL in its argv and codex in its `-c` overrides; agy has nowhere to receive one.
import { type SessionAgent } from "./sessionAgent.js";
import { isLaunchAgent } from "./launchAgent.js";
import { customAgentFor, type AgentPick, type CustomAgent } from "./customAgents.js";

export const FULL_GUI_MCP_AGENTS = ["claude", "codex"] as const;

export type FullGuiMcpAgent = (typeof FULL_GUI_MCP_AGENTS)[number];

export const agentCarriesFullGuiMcp = (agent: SessionAgent): agent is FullGuiMcpAgent => FULL_GUI_MCP_AGENTS.some((candidate) => candidate === agent);

/** The same question asked of an Agent Picker choice, which may name one of the user's own entries.
 *
 *  A custom agent IS the CLI its entry declares: the user's command is a wrapper and Claude Code's
 *  whole argv — `--mcp-config` included — is appended to it, so it receives what that CLI receives.
 *  Reading `entry.agent` rather than the command text is the point; nothing here parses a command.
 *
 *  A `custom:` pick whose entry is gone (a cell outliving its config) answers false: its CLI is no
 *  longer knowable, and offering the per-group toggles is the harmless way to be wrong. */
export const pickCarriesFullGuiMcp = (pick: AgentPick, customAgents: readonly CustomAgent[]): boolean => {
  const custom = customAgentFor(pick, customAgents);
  if (custom) return agentCarriesFullGuiMcp(custom.agent);
  return isLaunchAgent(pick) && agentCarriesFullGuiMcp(pick);
};
