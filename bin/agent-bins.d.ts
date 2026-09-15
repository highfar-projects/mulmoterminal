// Types for bin/agent-bins.js — hand-written for the reason every other bin/*.d.ts is: the file is
// plain JS because it runs before tsx does, and the specs and the server are TypeScript.
import type { TerminalAgent } from "../common/sessionAgent.js";

export interface AgentBinSpec {
  /** The environment variable that overrides the command, e.g. `CLAUDE_BIN`. */
  env: string;
  /** The command as installed. NOT always the agent id — agy and cursor-agent are the commands. */
  bin: string;
}

export declare const AGENT_BIN_SPEC: Record<TerminalAgent, AgentBinSpec>;
export declare function agentBin(agent: string, env?: Record<string, string | undefined>): string | null;
/** Only the agents this repository documents an install command for. */
export declare const AGENT_INSTALL_HINT: Partial<Record<TerminalAgent, string>>;
