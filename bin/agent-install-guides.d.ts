// Types for bin/agent-install-guides.js — hand-written for the reason every other bin/*.d.ts is: the
// file is plain JS because it runs before tsx does, and the specs and the server are TypeScript.
export interface AgentInstallGuideEntry {
  url: string;
  /** The date (YYYY-MM-DD) the page was last opened and confirmed to be this agent's install guide. */
  checked: string;
}

export declare function agentInstallGuide(agent: string): string | null;
export declare const AGENT_INSTALL_GUIDES: Readonly<Record<string, AgentInstallGuideEntry>>;
