// @vitest-environment node
// The #1536 fixes on the connect path, asserted through the real handlers.
//
// After a server restart `ptys` is empty while tmux still holds `mt-<session>` — the state every
// `!live` test misreads as a fresh spawn. The codex handler read the directory's tool groups on
// that path (from a request cwd that is often the DEFAULT workspace) and built an MCP argv that
// `tmux new-session -A` then discarded. And claude was the one agent endpoint that never asked
// clientStillConnected after its admission awaits, so a client that left mid-admission still got
// a pty — spawned after the socket's close event, which no later close handler can reap.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WebSocket } from "ws";

const mocks = vi.hoisted(() => ({
  // Whether tmux still holds the requested session — the restart-survivor case.
  tmuxHas: false,
  // Lets a test simulate the client leaving inside an admission await.
  onEnsureWorktreeEnv: () => {},
}));

const ptys = new Map<string, unknown>();
vi.mock("../../../server/session/registry.js", () => ({
  ptys,
  sessionCwd: () => null,
  devTerminalCwdsHydrated: Promise.resolve(),
  antigravityConversations: new Map(),
  antigravityConversationsHydrated: Promise.resolve(),
  museConversations: new Map(),
  museConversationsHydrated: Promise.resolve(),
  codexRollouts: new Map(),
  codexRolloutsHydrated: Promise.resolve(),
  customAgentSessionsHydrated: Promise.resolve(),
  markDevTerminalSession: vi.fn(),
  markAttachedSessionPlaced: vi.fn(),
}));

vi.mock("../../../server/infra/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/infra/tmux.js")>()),
  tmuxAvailable: () => true,
  tmuxHasSession: () => mocks.tmuxHas,
}));

// The rollout probe walks codex's real sessions root on disk; the resolver must not.
vi.mock("../../../server/agents/codex-sessions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/agents/codex-sessions.js")>()),
  codexRolloutExists: () => false,
}));

const registeredGuiMcpGroups = vi.fn(() => Promise.resolve(["render"]));
vi.mock("../../../server/infra/gui-mcp-registration.js", () => ({ registeredGuiMcpGroups }));

vi.mock("../../../server/config/worktree-env.js", () => ({
  ensureWorktreeEnv: vi.fn(() => {
    mocks.onEnsureWorktreeEnv();
    return Promise.resolve({});
  }),
  reservedWorktreeEnv: () => ({}),
}));

// A real occupancy read runs git against the cwd; this spec is about the handlers' shape.
vi.mock("../../../server/session/worktree-session-limit.js", () => ({
  claimLaunch: () => ({ release: vi.fn(), contended: false }),
  worktreeOccupancy: () => Promise.resolve({ isWorktree: false, session: null }),
}));

const { handleClaudeConnection, handleCodexConnection } = await import("../../../server/routes/ws-routes.js");

const SID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee02";
const fakeTerm = () => ({ pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() });

function fakeWs() {
  const sent: string[] = [];
  return {
    sent,
    readyState: 1,
    OPEN: 1,
    send: (raw: string) => sent.push(raw),
    close: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  };
}

const spawnClaudePty = vi.fn(() => ({ term: fakeTerm(), active: false }));
const spawnCodexPty = vi.fn(() => ({ term: fakeTerm(), active: false }));
const makeDeps = () =>
  ({
    spawnClaudePty,
    spawnCodexPty,
    reattachPty: vi.fn(),
    setWaiting: vi.fn(),
    handleClientFrame: vi.fn(),
    handleClientClose: vi.fn(),
  }) as never;

let dir = "";
const request = (query = "") => ({ url: `/ws?cwd=${encodeURIComponent(dir)}${query}` });

beforeEach(() => {
  ptys.clear();
  vi.clearAllMocks();
  mocks.tmuxHas = false;
  mocks.onEnsureWorktreeEnv = () => {};
  registeredGuiMcpGroups.mockResolvedValue(["render"]);
  dir = mkdtempSync(path.join(tmpdir(), "mt-ws-restart-"));
});
afterEach(() => {
  ptys.clear();
  rmSync(dir, { recursive: true, force: true });
});

describe("/ws/codex after a server restart (tmux survivor, no live pty)", () => {
  it("keeps the id, passes no resume id, and looks up no directory groups", async () => {
    mocks.tmuxHas = true;
    await handleCodexConnection(makeDeps(), fakeWs() as unknown as WebSocket, request(`&gui=0&session=${SID}`));
    // The attach ignores whatever argv a group lookup would build, and the request cwd it would
    // read from is untrustworthy on this path — so the lookup must not happen at all.
    expect(registeredGuiMcpGroups).not.toHaveBeenCalled();
    expect(spawnCodexPty).toHaveBeenCalledWith(SID, expect.anything(), null, dir, false, { mcpGroups: [] });
  });

  it("still reads the directory's groups for a genuinely fresh grid cell", async () => {
    await handleCodexConnection(makeDeps(), fakeWs() as unknown as WebSocket, request("&gui=0"));
    expect(registeredGuiMcpGroups).toHaveBeenCalledTimes(1);
    expect(spawnCodexPty).toHaveBeenCalledWith(expect.any(String), expect.anything(), null, dir, false, { mcpGroups: ["render"] });
  });
});

describe("/ws (claude) admission", () => {
  it("spawns nothing for a client that left during the admission awaits", async () => {
    const ws = fakeWs();
    mocks.onEnsureWorktreeEnv = () => {
      ws.readyState = 3; // the client closes while the handler awaits the worktree env
    };
    await handleClaudeConnection(makeDeps(), ws as unknown as WebSocket, request());
    expect(spawnClaudePty).not.toHaveBeenCalled();
  });

  it("spawns for a client that stayed", async () => {
    await handleClaudeConnection(makeDeps(), fakeWs() as unknown as WebSocket, request());
    expect(spawnClaudePty).toHaveBeenCalledTimes(1);
  });
});
