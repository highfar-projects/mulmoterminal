// @vitest-environment node
//
// Which spawns take a rotation token, and what a reattach writes (#2919). The choice itself is
// token-choice.spec.ts and the eligibility rule session-credential.spec.ts; this pins the spawn
// path that connects them — including that a reattach never re-chooses.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TokenAssignment } from "../../../../server/agents/token/token-assignment.js";

let reattach = false;
let probes = 0;
let spawnedOptions: { unset?: readonly string[]; env?: Record<string, string> } = {};
vi.mock("../../../../server/session/pty/pty-spawn.js", () => ({
  ptySpawn: (_id: string, _file: string, _args: string[], _cwd: string, _persistent: boolean, options: typeof spawnedOptions = {}) => {
    spawnedOptions = options;
    return { term: { pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() }, tmux: true, reattached: reattach };
  },
  ptyWouldReattach: () => {
    probes += 1;
    return reattach;
  },
}));
vi.mock("../../../../server/agents/claude/claude-help-probe.js", () => ({ refuseUnsupportedPermissionMode: vi.fn() }));
vi.mock("../../../../server/session/spawn/agents/claude-fullscreen-env.js", () => ({ claudeRendererEnv: () => ({}) }));
vi.mock("../../../../server/session/registry.js", () => ({
  knownSessions: new Map(),
  launchChoices: new Map(),
  customAgentSessions: new Map(),
  rememberCustomAgentSession: vi.fn(),
  ptys: new Map(),
  hookedSessions: new Set(),
  resetSessionToolGroups: vi.fn(),
  claimFullGuiMcp: () => true,
}));
vi.mock("../../../../server/session/session-reads.js", () => ({ sessionExistsOnDisk: () => false }));

const recorded = new Map<string, string | null>();
vi.mock("../../../../server/session/credentials/token-sessions.js", () => ({
  rememberTokenSession: (sessionId: string, tokenId: string | null) => recorded.set(sessionId, tokenId),
  sessionToken: (sessionId: string) => recorded.get(sessionId) ?? undefined,
}));

let rotationEnabled = true;
vi.mock("../../../../server/config/config-routes.js", () => ({
  getCustomAgents: () => [{ id: "wrap", label: "Wrap", agent: "claude", command: "wrap" }],
  getUserMcpServers: () => [],
  getPrWorkdirFooter: () => false,
  getAppendSystemPrompt: () => false,
  getTerminalSubmit: () => "cr",
  getProviders: () => [],
  getTokenRotation: () => ({ enabled: rotationEnabled, includeDefaultLogin: true, tokens: [] }),
}));

const { createClaudeSpawner } = await import("../../../../server/session/spawn/agents/spawn-claude.js");

const fresh: TokenAssignment = { tokenId: "b", env: { CLAUDE_CODE_OAUTH_TOKEN: "secret-b" }, unset: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] };
const kept: TokenAssignment = { tokenId: "a", env: { CLAUDE_CODE_OAUTH_TOKEN: "secret-a" }, unset: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] };
const settingsEnv: Record<string, string>[] = [];
const assignToken = vi.fn(() => fresh);
const keptAssignment = vi.fn((tokenId: string | undefined) => (tokenId === "a" ? kept : null));

const deps = {
  claudeBin: "claude",
  codexBin: "codex",
  codexModel: null,
  antigravityBin: "agy",
  antigravityModel: null,
  grokBin: "grok",
  grokModel: null,
  museBin: "muse",
  museModel: null,
  copilotBin: "copilot",
  copilotModel: null,
  cursorBin: "cursor-agent",
  cursorModel: null,
  permissionMode: "acceptEdits",
  guiMcpTools: "mcp__mt",
  gridMcpTools: "mcp__mulmoterminal-render__presentHtml",
  outputBufferLimit: 1000,
  hookSettingsJson: (_host: string, _sessionId: string, env: Record<string, string> = {}) => (settingsEnv.push(env), "{}"),
  mcpConfigJson: () => "{}",
  reap: vi.fn(),
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  uiPort: "3000",
  publishSessionCreated: vi.fn(),
  publishActivity: vi.fn(),
  publishPromptSubmitted: vi.fn(),
  assignToken,
  keptAssignment,
};

let nextId = 0;
const freshId = () => `22222222-3333-4444-8555-${String(++nextId).padStart(12, "0")}`;
const spawn = (id: string, options: Record<string, unknown> = {}) =>
  createClaudeSpawner(deps).spawnClaudePty(id, null, null, { cwd: process.cwd(), attachGuiMcp: false, ...options });

beforeEach(() => {
  reattach = false;
  rotationEnabled = true;
  probes = 0;
  spawnedOptions = {};
  settingsEnv.length = 0;
  assignToken.mockClear();
  keptAssignment.mockClear();
});

describe("spawnClaudePty with token rotation (#2919)", () => {
  it("starts a new process on the chosen token, in the settings env, and records it", () => {
    const id = freshId();
    spawn(id);
    expect(settingsEnv.at(-1)).toEqual(fresh.env);
    expect(spawnedOptions.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(spawnedOptions.unset).toEqual(expect.arrayContaining(["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]));
    expect(recorded.get(id)).toBe("b");
  });

  it("on a reattach, writes the recorded token and neither re-chooses nor re-records", () => {
    const id = freshId();
    recorded.set(id, "a");
    reattach = true;
    spawn(id);
    expect(assignToken).not.toHaveBeenCalled();
    expect(keptAssignment).toHaveBeenCalledWith("a");
    expect(settingsEnv.at(-1)).toEqual(kept.env);
    expect(recorded.get(id)).toBe("a");
  });

  it("never rotates a custom agent", () => {
    const id = freshId();
    spawn(id, { customAgentId: "wrap" });
    expect(assignToken).not.toHaveBeenCalled();
    expect(settingsEnv.at(-1)).toEqual({});
    expect(recorded.get(id)).toBeNull();
  });

  it("with rotation off, asks nothing extra and records the process as not rotated", () => {
    rotationEnabled = false;
    const id = freshId();
    spawn(id);
    expect(assignToken).not.toHaveBeenCalled();
    expect(probes).toBe(1);
    expect(recorded.get(id)).toBeNull();
  });
});
