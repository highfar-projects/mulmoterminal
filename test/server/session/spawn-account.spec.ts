// @vitest-environment node
//
// Which ACCOUNT (Claude Code login) a spawned session's settings carry (common/accounts.ts):
// resolved from the request, the directory's own default, or — on resume — whatever the session
// was started on. Mirrors spawn-custom-agent.spec.ts's shape, since account resolution follows
// the exact same rule as a custom agent's (resolveSessionAccount / resolveCustomAgent).
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Account } from "../../../common/accounts.js";

const ID = "11111111-2222-4333-8444-555555555555";

vi.mock("../../../server/session/pty-spawn.js", () => ({
  ptySpawn: () => ({ term: { pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() }, tmux: true, reattached: false }),
  ptyWouldReattach: () => false,
}));

// Captures the env the settings file would have carried — the one observable trace of which
// account (if any) was resolved, since a spawned pty is otherwise a black box here.
let capturedEnv: Record<string, string> = {};

const accountSessions = new Map<string, string>();

vi.mock("../../../server/session/registry.js", () => ({
  knownSessions: new Map(),
  launchChoices: new Map(),
  customAgentSessions: new Map(),
  rememberCustomAgentSession: vi.fn(),
  accountSessions,
  rememberAccountSession: (sessionId: string, accountId: string) => accountSessions.set(sessionId, accountId),
  ptys: new Map(),
  hookedSessions: new Set(),
  resetSessionToolGroups: vi.fn(),
  claimFullGuiMcp: () => true,
}));

let onDisk = false;
vi.mock("../../../server/session/session-reads.js", () => ({ sessionExistsOnDisk: () => onDisk }));

let dirAccount: string | null = null;

vi.mock("../../../server/config/dir-config.js", () => ({
  loadDirConfig: () => ({
    provider: null,
    model: null,
    account: dirAccount,
    addDirs: null,
    devcontainer: null,
    appendSystemPrompt: null,
  }),
}));

let configuredAccounts: Account[] = [];

vi.mock("../../../server/config/config-routes.js", () => ({
  getCustomAgents: () => [],
  getUserMcpServers: () => [],
  getPrWorkdirFooter: () => false,
  getAppendSystemPrompt: () => false,
  getTerminalSubmit: () => "cr",
  getProviders: () => [],
  getAccounts: () => configuredAccounts,
}));

const { createClaudeSpawner } = await import("../../../server/session/spawn-claude.js");

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
  hookSettingsJson: (_host: string, _sessionId: string, env: Record<string, string> = {}) => {
    capturedEnv = env;
    return "{}";
  },
  mcpConfigJson: () => "{}",
  reap: vi.fn(),
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  uiPort: "3000",
  publishSessionCreated: vi.fn(),
  publishActivity: vi.fn(),
  publishPromptSubmitted: vi.fn(),
};

let nextId = 0;
const freshId = () => `11111111-2222-4333-8444-${String(++nextId).padStart(12, "0")}`;
const spawn = (options: Record<string, unknown>, id: string = ID) =>
  createClaudeSpawner(deps).spawnClaudePty(id, null, null, { cwd: "/tmp/mt-account-spec", attachGuiMcp: false, ...options });

const resume = (options: Record<string, unknown>, id: string) => {
  onDisk = true;
  try {
    return createClaudeSpawner(deps).spawnClaudePty(id, id, null, { cwd: "/tmp/mt-account-spec", attachGuiMcp: false, ...options });
  } finally {
    onDisk = false;
  }
};

const WORK: Account = { id: "work", label: "Work", configDir: "/opt/claude-work" };

beforeEach(() => {
  configuredAccounts = [WORK];
  dirAccount = null;
  onDisk = false;
  capturedEnv = {};
});

describe("resolveSessionAccount (#579-shaped, via spawnClaudePty)", () => {
  it("injects nothing when no account is picked, configured or defaulted", () => {
    spawn({}, freshId());
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });

  it("prefers the explicitly requested account over the directory's default", () => {
    dirAccount = "personal";
    configuredAccounts = [WORK, { id: "personal", label: "Personal", configDir: "/opt/claude-personal" }];
    spawn({ accountId: "work" }, freshId());
    expect(capturedEnv.CLAUDE_CONFIG_DIR).toBe("/opt/claude-work");
  });

  it("falls back to the directory's own default when none was requested", () => {
    dirAccount = "work";
    spawn({}, freshId());
    expect(capturedEnv.CLAUDE_CONFIG_DIR).toBe("/opt/claude-work");
  });

  // The three "never throw, never block the spawn" cases (requirement 0): empty/unset accounts,
  // an unspecified accountId, and a stale one all fall back to no injection rather than a refusal.
  it("falls back to no injection when accounts is empty", () => {
    configuredAccounts = [];
    expect(() => spawn({ accountId: "work" }, freshId())).not.toThrow();
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });

  it("falls back to no injection when accountId is unspecified", () => {
    expect(() => spawn({}, freshId())).not.toThrow();
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });

  it("falls back to no injection, with a warning rather than a throw, for an accountId the config does not have", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => spawn({ accountId: "ghost" }, freshId())).not.toThrow();
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ghost"));
    warn.mockRestore();
  });

  // A resume must continue on the login the session began on — never on the directory's default,
  // which may have moved on, and never on a request the browser is not even sending on resume.
  it("remembers the account when resuming, even with no id in the request", () => {
    const id = freshId();
    spawn({ accountId: "work" }, id);
    resume({}, id);
    expect(capturedEnv.CLAUDE_CONFIG_DIR).toBe("/opt/claude-work");
  });

  it("ignores the directory's default when resuming a session that began without an account", () => {
    const id = freshId();
    spawn({}, id);
    dirAccount = "work"; // the directory picked up a default only AFTER this session started
    resume({}, id);
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });

  it("falls back to no injection on resume when the account it was started on is gone", () => {
    const id = freshId();
    spawn({ accountId: "work" }, id);
    configuredAccounts = [];
    resume({}, id);
    expect(capturedEnv).not.toHaveProperty("CLAUDE_CONFIG_DIR");
  });
});
