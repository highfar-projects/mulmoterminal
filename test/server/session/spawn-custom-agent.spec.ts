// @vitest-environment node
//
// A CUSTOM AGENT is the whole point of the feature in one assertion: the user's command line runs
// as the program, and Claude Code's OWN argv — the session id, the hook settings, the permission
// mode, the allowlist — is appended to it unchanged (#1414).
//
// Without that appending it would just be a launcher chip, and the session would have no id to
// resume, no hooks to report with, and no GUI tools. With it, `ollama launch claude --model … --`
// is a drop-in replacement for the `claude` binary.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomAgent } from "../../../common/customAgents.js";

const ID = "11111111-2222-4333-8444-555555555555";

let spawnedFile = "";
let spawnedArgs: string[] = [];
let spawnedOptions: Record<string, unknown> = {};

vi.mock("../../../server/session/pty-spawn.js", () => ({
  ptySpawn: (_id: string, file: string, args: string[], _cwd: string, _persistent: boolean, options: Record<string, unknown> = {}) => {
    spawnedFile = file;
    spawnedArgs = args;
    spawnedOptions = options;
    return { term: { pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() }, tmux: true, reattached: false };
  },
  ptyWouldReattach: () => false,
}));

vi.mock("../../../server/session/registry.js", () => ({
  knownSessions: new Map(),
  launchChoices: new Map(),
  customAgentSessions: new Map(),
  ptys: new Map(),
  hookedSessions: new Set(),
  resetSessionToolGroups: vi.fn(),
  claimFullGuiMcp: () => true,
}));

vi.mock("../../../server/session/session-reads.js", () => ({ sessionExistsOnDisk: () => false }));

const nemotron: CustomAgent = { id: "nemotron", label: "Nemotron", agent: "claude", command: "ollama launch claude --model nemotron-3-ultra:cloud --" };
let configured: CustomAgent[] = [nemotron];

vi.mock("../../../server/config/config-routes.js", () => ({
  getCustomAgents: () => configured,
  getUserMcpServers: () => [],
  getPrWorkdirFooter: () => false,
  getAppendSystemPrompt: () => false,
  getTerminalSubmit: () => "cr",
  getProviders: () => [],
}));

const { createClaudeSpawner } = await import("../../../server/session/spawn-claude.js");

const deps = {
  claudeBin: "claude",
  codexBin: "codex",
  codexModel: null,
  antigravityBin: "agy",
  antigravityModel: null,
  permissionMode: "acceptEdits",
  guiMcpTools: "mcp__mt",
  gridMcpTools: "mcp__mulmoterminal-render__presentHtml",
  outputBufferLimit: 1000,
  hookSettingsJson: () => "{}",
  mcpConfigJson: () => "{}",
  reap: vi.fn(),
  setWorking: vi.fn(),
  setWaiting: vi.fn(),
  uiPort: "3000",
  publishSessionCreated: vi.fn(),
};

// A per-test session id where the test is not ABOUT the memory: the spawn remembers which
// wrapper an id was started on, so reusing one id across "wrapper" and "plain" would have the
// memory answer the second call and the assertion would be about the wrong thing.
let nextId = 0;
const freshId = () => `11111111-2222-4333-8444-${String(++nextId).padStart(12, "0")}`;
const spawn = (options: Record<string, unknown>, id: string = ID) =>
  createClaudeSpawner(deps).spawnClaudePty(id, null, null, { cwd: process.cwd(), attachGuiMcp: false, ...options });

beforeEach(() => {
  configured = [nemotron];
  spawnedFile = "";
  spawnedArgs = [];
  spawnedOptions = {};
});

describe("spawnClaudePty with a custom agent (#1414)", () => {
  it("runs the user's program with their arguments in front of Claude Code's", () => {
    spawn({ customAgentId: "nemotron" }, freshId());
    expect(spawnedFile).toBe("ollama");
    expect(spawnedArgs.slice(0, 6)).toEqual(["launch", "claude", "--model", "nemotron-3-ultra:cloud", "--", "--session-id"]);
  });

  // The argv AFTER the `--` has to be exactly what plain claude would have received — that is
  // what makes the wrapper a replacement for the binary rather than a different way to start it.
  it("appends the identical argv plain claude would have been given", () => {
    // The two spawns need different session ids (see freshId), so the id is masked wherever it
    // appears — `--session-id` and the per-session drops directory under `--add-dir` — and
    // everything else has to match exactly.
    const withoutId = (args: string[], id: string): string[] => args.map((arg) => arg.split(id).join("<id>"));
    const wrapperId = freshId();
    const plainId = freshId();
    spawn({ customAgentId: "nemotron" }, wrapperId);
    const wrapped = spawnedArgs;
    spawn({}, plainId);
    expect(spawnedFile).toBe("claude");
    expect(withoutId(wrapped.slice(wrapped.indexOf("--") + 1), wrapperId)).toEqual(withoutId(spawnedArgs, plainId));
  });

  // `binEnvVar` opts a spawn into the pre-flight "can this run" check, whose message names the env
  // var that would FIX it. A custom agent has no such override — the fix is the config entry — so
  // the check is left off and the child reports its own failure.
  it("keeps the CLAUDE_BIN pre-flight check for plain claude, and drops it for a wrapper", () => {
    spawn({}, freshId());
    expect(spawnedOptions.binEnvVar).toBe("CLAUDE_BIN");
    spawn({ customAgentId: "nemotron" }, freshId());
    expect(spawnedOptions.binEnvVar).toBeUndefined();
  });

  // The configured list is the allowlist, and it is read at spawn: an id the browser sends that
  // names nothing starts plain claude rather than nothing at all.
  it("falls back to plain claude for an id the config does not have", () => {
    configured = [];
    spawn({ customAgentId: "nemotron" }, freshId());
    expect(spawnedFile).toBe("claude");
  });

  // A cell restored after a page reload no longer sends the id, and a session resumed as plain
  // claude when it began under a wrapper would move to a different model mid-conversation.
  it("remembers the wrapper for a later reconnect that sends no id", () => {
    const id = freshId();
    spawn({ customAgentId: "nemotron" }, id);
    spawn({}, id);
    expect(spawnedFile).toBe("ollama");
  });

  // …and forgets it when the entry is gone, so the memory cannot outlive the config.
  it("stops remembering one the user has deleted", () => {
    const id = freshId();
    spawn({ customAgentId: "nemotron" }, id);
    configured = [];
    spawn({}, id);
    expect(spawnedFile).toBe("claude");
  });
});
