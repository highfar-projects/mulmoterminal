// Where each agent CLI keeps its own state — logins, transcripts, skills — before any per-agent
// layout below it. One table so that a reader can never build a home by hand and drift from the
// others: a home that points somewhere the agent did not write reads as "no sessions", not as an
// error.
import os from "node:os";
import path from "node:path";
import type { TerminalAgent } from "../../common/sessionAgent.js";

interface AgentHome {
  /** The variable the agent itself reads to relocate its home, when this server honours it. */
  envVar: string | null;
  /** The home under the user's home directory when the variable is unset or empty. */
  defaultSegments: readonly string[];
}

const AGENT_HOMES: Record<TerminalAgent, AgentHome> = {
  // CLAUDE_CONFIG_DIR is not honoured here yet; only the `.claude.json` lookup reads it.
  claude: { envVar: null, defaultSegments: [".claude"] },
  codex: { envVar: "CODEX_HOME", defaultSegments: [".codex"] },
  antigravity: { envVar: "ANTIGRAVITY_HOME", defaultSegments: [".gemini", "antigravity-cli"] },
  grok: { envVar: "GROK_HOME", defaultSegments: [".grok"] },
  muse: { envVar: "MUSE_HOME", defaultSegments: [".local", "share", "muse"] },
  copilot: { envVar: "COPILOT_HOME", defaultSegments: [".copilot"] },
  // cursor documents no override.
  cursor: { envVar: null, defaultSegments: [".cursor"] },
};

/** The agent's home ignoring any relocation variable. Read at call time, so a spec that swaps
 *  `HOME` still takes effect. */
export const agentDefaultHome = (agent: TerminalAgent): string => path.join(os.homedir(), ...AGENT_HOMES[agent].defaultSegments);

/** The agent's home: its relocation variable when set and non-empty, else the default. */
export const agentHome = (agent: TerminalAgent): string => {
  const { envVar } = AGENT_HOMES[agent];
  return (envVar && process.env[envVar]) || agentDefaultHome(agent);
};
