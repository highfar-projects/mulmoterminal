// @vitest-environment node
// WHICH directory a copilot reconnect actually runs in — asserted at the SPAWNER, not at the probe.
//
// The resume probe was made cwd-bound so another project's conversation cannot be resumed here. The
// first version of that fix changed only the probe, and left the worktree reservation, the
// admission and the spawn reading the request's `?cwd=` — which `wsConnectionContext` resolves to
// the DEFAULT workspace when the URL omits it. A cold reconnect therefore resumed the right
// conversation and then ran it in the wrong directory, and a test that checked only the probe's
// argument stayed green through it (Codex round 6 of #2063, P1).
//
// So this one drives the real handler and asserts what the SPAWNER was handed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WebSocket } from "ws";

const ptys = new Map<string, unknown>();
const sessionCwd = vi.fn((): string | null => null);
const markDevTerminalSession = vi.fn();
vi.mock("../../../server/session/registry.js", () => ({
  ptys,
  sessionCwd: () => sessionCwd(),
  devTerminalCwdsHydrated: Promise.resolve(),
  antigravityConversations: new Map(),
  antigravityConversationsHydrated: Promise.resolve(),
  museConversations: new Map(),
  museConversationsHydrated: Promise.resolve(),
  codexRollouts: new Map(),
  codexRolloutsHydrated: Promise.resolve(),
  customAgentSessionsHydrated: Promise.resolve(),
  markDevTerminalSession,
  markAttachedSessionPlaced: vi.fn(),
}));

vi.mock("../../../server/infra/tmux.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/infra/tmux.js")>()),
  tmuxAvailable: () => false,
  tmuxHasSession: () => false,
}));

// The session exists wherever it is asked about, so the probe's answer cannot be what makes this
// pass or fail — only the DIRECTORY handed on does.
vi.mock("../../../server/agents/copilot-sessions.js", () => ({
  copilotSessionExistsForCwd: async () => true,
  copilotSessionExists: () => true,
  listCopilotSessionsForCwd: async () => [],
  copilotSessionStatePath: () => "/nonexistent",
}));

const reserveWorktreeEnv = vi.fn(async () => ({}));
vi.mock("../../../server/config/worktree-env.js", () => ({
  ensureWorktreeEnv: (...args: unknown[]) => reserveWorktreeEnv(...(args as [])),
  reservedWorktreeEnv: () => ({}),
}));

vi.mock("../../../server/session/worktree-session-limit.js", () => ({
  claimLaunch: () => ({ release: vi.fn(), contended: false }),
  worktreeOccupancy: () => Promise.resolve({ isWorktree: false, session: null }),
}));

vi.mock("../../../server/infra/gui-mcp-registration.js", () => ({ registeredGuiMcpGroups: vi.fn(async () => []) }));

const { handleCopilotConnection } = await import("../../../server/routes/ws-routes.js");

const fakeTerm = () => ({ pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() });
const spawnCopilotPty = vi.fn(() => ({ term: fakeTerm(), active: false }));
const deps = { spawnCopilotPty, reattachPty: vi.fn(), handleClientFrame: vi.fn(), handleClientClose: vi.fn() } as never;

const fakeWs = () => ({ readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn(), on: vi.fn(), off: vi.fn(), once: vi.fn() }) as unknown as WebSocket;

const ID = "3a7c1e90-2b44-4c8e-9d10-5f6a7b8c9d01";
let requestDir = "";
let rememberedDir = "";

beforeEach(() => {
  ptys.clear();
  vi.clearAllMocks();
  requestDir = mkdtempSync(path.join(tmpdir(), "mt-copilot-req-"));
  rememberedDir = mkdtempSync(path.join(tmpdir(), "mt-copilot-remembered-"));
  sessionCwd.mockReturnValue(null);
});

/** The 4th positional argument of spawnCopilotPty is the directory the session runs in. */
const spawnedCwd = () => (spawnCopilotPty.mock.calls[0] as unknown as unknown[] | undefined)?.[3];

describe("handleCopilotConnection", () => {
  it("runs a reconnect in the session's REMEMBERED directory, not the one the URL carried", async () => {
    sessionCwd.mockReturnValue(rememberedDir);
    await handleCopilotConnection(deps, fakeWs(), { url: `/ws/copilot?cwd=${encodeURIComponent(requestDir)}&session=${ID}&gui=0` } as never);
    expect(spawnedCwd()).toBe(rememberedDir);
  });

  it("runs a fresh cell in the directory the URL asked for", async () => {
    sessionCwd.mockReturnValue(null);
    await handleCopilotConnection(deps, fakeWs(), { url: `/ws/copilot?cwd=${encodeURIComponent(requestDir)}&gui=0` } as never);
    expect(spawnedCwd()).toBe(requestDir);
  });

  it("records the cell's directory as the remembered one, so the next reconnect agrees", async () => {
    sessionCwd.mockReturnValue(rememberedDir);
    await handleCopilotConnection(deps, fakeWs(), { url: `/ws/copilot?cwd=${encodeURIComponent(requestDir)}&session=${ID}&gui=0` } as never);
    expect(markDevTerminalSession).toHaveBeenCalledWith(ID, rememberedDir);
  });
});
