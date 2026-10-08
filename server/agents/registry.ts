import type { AgentAdapter, AgentKind } from "./types.js";
import { claudeAdapter } from "./claude/claude.js";
import { codexAdapter } from "./codex/codex.js";
import { antigravityAdapter } from "./antigravity/antigravity.js";
import { grokAdapter } from "./grok/grok.js";
import { museAdapter } from "./muse/muse.js";
import { copilotAdapter } from "./copilot/copilot.js";
import { cursorAdapter } from "./cursor/cursor.js";

const adapters: Record<AgentKind, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  antigravity: antigravityAdapter,
  grok: grokAdapter,
  muse: museAdapter,
  copilot: copilotAdapter,
  cursor: cursorAdapter,
};

// Resolve the adapter for a kind; Claude is the default and the fallback.
export function getAgentAdapter(kind: AgentKind = "claude"): AgentAdapter {
  return adapters[kind];
}
