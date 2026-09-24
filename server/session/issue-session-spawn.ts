// The session an issue's work starts in, for whichever agent was asked for (#2228).
//
// An issue session is a PROJECT cell: it runs in the issue's worktree and takes its GUI tools from
// what that directory registered, the way a cell opened there would — not the full toolset a
// GUI-started chat gets, which is why spawnSeededSession is not reused as it stands. What each
// agent needs to get there differs (codex and copilot take a flag, cursor's file has to be written
// and approved first), so each has its own entry, kept in step with its cell in ws-routes.ts.
import { randomUUID } from "node:crypto";
import { isTerminalAgent, type TerminalAgent } from "../../common/sessionAgent.js";
import type { ToolGroup } from "../../common/toolGroups.js";
import { spawnModeFor } from "./background-chat.js";
import { issueSpawnOptions } from "./issue-spawn-options.js";
import { syncDirectoryMcpForSpawnAsync } from "./spawn-directory-mcp.js";
import type { SpawnedSession } from "../git/issue-work.js";
import type { SpawnAntigravityPty, SpawnClaudePty, SpawnCodexPty, SpawnCopilotPty, SpawnCursorPty, SpawnGrokPty, SpawnMusePty } from "./spawners.js";

export interface IssueSessionSpawnDeps {
  spawnClaudePty: SpawnClaudePty;
  spawnCodexPty: SpawnCodexPty;
  spawnCopilotPty: SpawnCopilotPty;
  spawnCursorPty: SpawnCursorPty;
  spawnAntigravityPty: SpawnAntigravityPty;
  spawnGrokPty: SpawnGrokPty;
  spawnMusePty: SpawnMusePty;
  /** The tool groups the directory registered, as a cell there would read them. */
  groupsFor: (cwd: string) => Promise<readonly ToolGroup[]>;
  /** Write cursor's directory file and approve its entries, before cursor reads either. */
  syncCursorMcp: (cwd: string, groups: readonly ToolGroup[]) => Promise<void>;
  /** The worktree's own PORT / DB_NAME (#1367), reserved as a cell's fresh spawn reserves them. A
   *  worktree cut just now already has them; a reopened one may not. */
  reserveWorktreeEnv: (cwd: string) => Promise<void>;
  newSessionId?: () => string;
}

export type SpawnIssueSession = (agent: TerminalAgent, cwd: string, seed: string, run: boolean) => Promise<SpawnedSession>;

interface SpawnRequest {
  sessionId: string;
  cwd: string;
  seed: string;
  run: boolean;
}

type AgentSpawn = (request: SpawnRequest, deps: IssueSessionSpawnDeps) => Promise<void>;

/** The agent an issue-start request asked for. Absent means Claude, which is what every issue
 *  session was before the field existed; anything that is not an agent is refused (null) rather
 *  than quietly started as Claude. */
export function requestedIssueAgent(raw: unknown): TerminalAgent | null {
  if (raw === undefined) return "claude";
  return typeof raw === "string" && isTerminalAgent(raw) ? raw : null;
}

const directoryGroupsSpawn =
  (pick: (deps: IssueSessionSpawnDeps) => SpawnAntigravityPty | SpawnGrokPty | SpawnMusePty): AgentSpawn =>
  async ({ sessionId, cwd, seed }, deps) => {
    pick(deps)(sessionId, null, null, cwd, { mcpGroups: await deps.groupsFor(cwd), initialPrompt: seed });
  };

// A Record over the agents, so hosting a new one is a type error here rather than an issue start
// that silently spawns Claude under its name.
const AGENT_SPAWN: Record<TerminalAgent, AgentSpawn> = {
  claude: async ({ sessionId, cwd, seed, run }, deps) => {
    deps.spawnClaudePty(sessionId, null, null, issueSpawnOptions(cwd, seed, run));
  },
  codex: async ({ sessionId, cwd, seed }, deps) => {
    deps.spawnCodexPty(sessionId, null, null, cwd, false, { mcpGroups: await deps.groupsFor(cwd), initialPrompt: seed });
  },
  copilot: async ({ sessionId, cwd, seed }, deps) => {
    deps.spawnCopilotPty(sessionId, null, null, cwd, false, { mcpGroups: await deps.groupsFor(cwd), initialPrompt: seed });
  },
  // Cursor loads only servers it has APPROVED, and an unapproved one is silently absent, so the file
  // is written and approved before the spawn — as its cell does (ws-routes.ts).
  cursor: async ({ sessionId, cwd, seed }, deps) => {
    const mcpGroups = await deps.groupsFor(cwd);
    await syncDirectoryMcpForSpawnAsync(sessionId, cwd, mcpGroups, deps.syncCursorMcp);
    deps.spawnCursorPty(sessionId, null, null, cwd, { mcpGroups, initialPrompt: seed });
  },
  antigravity: directoryGroupsSpawn((deps) => deps.spawnAntigravityPty),
  grok: directoryGroupsSpawn((deps) => deps.spawnGrokPty),
  muse: directoryGroupsSpawn((deps) => deps.spawnMusePty),
};

export function createIssueSessionSpawner(deps: IssueSessionSpawnDeps): SpawnIssueSession {
  const newSessionId = deps.newSessionId ?? randomUUID;
  return async (agent, cwd, seed, run) => {
    const sessionId = newSessionId();
    // Always a fresh session (a new id), so never the reattach a cell skips this for.
    await deps.reserveWorktreeEnv(cwd);
    await AGENT_SPAWN[agent]({ sessionId, cwd, seed, run }, deps);
    // Only Claude can leave the seed as a draft; the rule is spawnModeFor's, not a second copy.
    return { sessionId, agent, seedRuns: spawnModeFor(agent, !run) !== "claude-draft" };
  };
}
