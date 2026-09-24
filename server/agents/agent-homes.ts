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
  /** The agent NFC-normalises its home before using it; on a filesystem that does not fold
   *  normalisation (Linux), reading the unnormalised spelling finds nothing. */
  nfc: boolean;
}

const AGENT_HOMES: Record<TerminalAgent, AgentHome> = {
  claude: { envVar: "CLAUDE_CONFIG_DIR", defaultSegments: [".claude"], nfc: true },
  codex: { envVar: "CODEX_HOME", defaultSegments: [".codex"], nfc: false },
  antigravity: { envVar: "ANTIGRAVITY_HOME", defaultSegments: [".gemini", "antigravity-cli"], nfc: false },
  grok: { envVar: "GROK_HOME", defaultSegments: [".grok"], nfc: false },
  muse: { envVar: "MUSE_HOME", defaultSegments: [".local", "share", "muse"], nfc: false },
  copilot: { envVar: "COPILOT_HOME", defaultSegments: [".copilot"], nfc: false },
  // cursor documents no override.
  cursor: { envVar: null, defaultSegments: [".cursor"], nfc: false },
};

const spelledAsAgent = (agent: TerminalAgent, home: string): string => (AGENT_HOMES[agent].nfc ? home.normalize("NFC") : home);

/** The agent's home ignoring any relocation variable. Read at call time, so a spec that swaps
 *  `HOME` still takes effect. */
export const agentDefaultHome = (agent: TerminalAgent): string => spelledAsAgent(agent, path.join(os.homedir(), ...AGENT_HOMES[agent].defaultSegments));

/** The agent's home: its relocation variable when set and non-empty, else the default. */
export const agentHome = (agent: TerminalAgent): string => {
  const { envVar } = AGENT_HOMES[agent];
  const relocated = envVar && process.env[envVar];
  return relocated ? spelledAsAgent(agent, relocated) : agentDefaultHome(agent);
};
