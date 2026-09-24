// What the PRs & Issues view must say before an issue's work starts in a non-Claude agent (#2226,
// decided on #2234): the issue text is anyone's, and every agent but a Claude draft runs it at once.
//
// Which agents also approve their own tools is a fact about how each one is SPAWNED, not a setting
// here — kept in step by hand with server/session/spawn-antigravity.ts and spawn-grok.ts
// (`skipPermissions: true`), spawn-copilot.ts (`allowAllTools: true`), and the unconditional
// `--force` / `--yolo` in server/agents/cursor-args.ts and muse-args.ts. Codex keeps its own
// approval policy (only this app's MCP tools are pre-approved), so it gets the milder sentence.
import type { TerminalAgent } from "../../common/sessionAgent";

export type IssueStartWarning = "none" | "runsAtOnce" | "runsAtOnceAutoApproved";

const WARNING: Record<TerminalAgent, IssueStartWarning> = {
  claude: "none",
  codex: "runsAtOnce",
  antigravity: "runsAtOnceAutoApproved",
  grok: "runsAtOnceAutoApproved",
  muse: "runsAtOnceAutoApproved",
  copilot: "runsAtOnceAutoApproved",
  cursor: "runsAtOnceAutoApproved",
};

export const issueStartWarning = (agent: TerminalAgent): IssueStartWarning => WARNING[agent];
