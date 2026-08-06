// @vitest-environment node
//
// muse's GUI MCP has two halves, and they live in different places on purpose — this pins the join.
//
// The REGISTRATION is machine-wide: `muse plugins install` copies the bundle into a
// content-addressed cache and records it for the user, with no per-directory form (measured). So
// the plugin declares every tool group, always, and installing it says nothing about which
// directory may use what.
//
// The ENTITLEMENT is per session, and it is RECORDED rather than exported: a plugin's MCP server
// is started with a curated environment carrying nothing of ours (measured), so the bridge resolves
// its own session against this server and is told the groups with the answer. That is what keeps
// the launcher's per-directory switches meaningful for an agent whose registration cannot honour
// them.
//
// Get the join wrong in either direction and it is silent: a session that carries no groups shows
// no tools with nothing logged, and one that carries groups the directory never registered hands a
// cell tools its neighbours were not given.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ID = "11111111-2222-4333-8444-555555555555";
const CWD = "/home/me/project";

let reattaching = false;
const syncMuseMcpPlugin = vi.fn();
const spawned: { env: Record<string, string> | undefined }[] = [];

vi.mock("../../../server/session/pty-spawn.js", () => ({
  ptySpawn: (_id: string, _bin: string, _args: string[], _cwd: string, _tmux: boolean, options: { env?: Record<string, string> }) => {
    spawned.push({ env: options?.env });
    return { term: fakeTerm(), tmux: true, reattached: reattaching };
  },
  ptyWouldReattach: () => reattaching,
}));

vi.mock("../../../server/agents/muse-mcp.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../server/agents/muse-mcp.js")>()),
  syncMuseMcpPlugin: () => syncMuseMcpPlugin(),
}));

vi.mock("../../../server/session/registry.js", () => ({
  ptys: new Map(),
  claimedMuseSessions: new Set(),
  rememberMuseSession: vi.fn(),
}));

vi.mock("../../../server/session/pty-relay.js", () => ({ wireAgentPtyRelay: vi.fn() }));

const rememberEntitledToolGroups = vi.fn();
vi.mock("../../../server/session/bridge-session.js", () => ({
  rememberEntitledToolGroups: (id: string, groups: readonly string[]) => rememberEntitledToolGroups(id, groups),
}));
vi.mock("../../../server/agents/muse-session.js", () => ({
  snapshotMuseSessions: () => Promise.resolve(new Set<string>()),
  watchForMuseSession: () => Promise.resolve(null),
}));

const fakeTerm = () => ({ pid: 1, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), kill: vi.fn(), resize: vi.fn() });

const { createMuseSpawner } = await import("../../../server/session/spawn-muse.js");

const deps = { museBin: "muse", museModel: null, publishActivity: vi.fn() } as unknown as Parameters<typeof createMuseSpawner>[0];
const spawn = (groups: readonly string[]) => createMuseSpawner(deps).spawnMusePty(ID, null, null, CWD, { mcpGroups: groups as never });

const lastEnv = () => spawned[spawned.length - 1]?.env ?? {};

describe("spawnMusePty and the machine-wide plugin", () => {
  beforeEach(() => {
    reattaching = false;
    spawned.length = 0;
    syncMuseMcpPlugin.mockClear();
  });

  it("registers the plugin when it really starts muse", () => {
    spawn(["render"]);
    expect(syncMuseMcpPlugin).toHaveBeenCalledTimes(1);
  });

  // The same rule the two file-writing agents follow, for the same reason: after a restart this is
  // reached for what turns out to be a tmux reattach, and the muse already running in that pane
  // read its plugins at its own start. Registering now could only speak for other sessions.
  it("does not register when tmux will reattach an already-running muse", () => {
    reattaching = true;
    spawn(["render"]);
    expect(syncMuseMcpPlugin).not.toHaveBeenCalled();
  });

  // Deliberately NOT gated on having a group: the registration is inert until a session's own
  // entitlement says otherwise, so a directory switching its first group on mid-session must not
  // have to wait for a later spawn that happens to have one already.
  it("registers even for a directory that has switched nothing on", () => {
    spawn([]);
    expect(syncMuseMcpPlugin).toHaveBeenCalledTimes(1);
  });
});

describe("spawnMusePty and the session's entitlement", () => {
  beforeEach(() => {
    reattaching = false;
    spawned.length = 0;
    syncMuseMcpPlugin.mockClear();
    rememberEntitledToolGroups.mockClear();
  });

  it("records exactly the groups the directory registered, against this session", () => {
    spawn(["render", "media"]);
    expect(rememberEntitledToolGroups).toHaveBeenCalledWith(ID, ["render", "media"]);
  });

  // An empty list is a real answer, not a missing one — every server stands down, which is what a
  // muse cell in an unregistered directory had before any of this.
  it("records an empty list for a directory that registered nothing", () => {
    spawn([]);
    expect(rememberEntitledToolGroups).toHaveBeenCalledWith(ID, []);
  });

  // The whole feature is behind muse's experimental flag. This one IS an environment variable,
  // because it is read by the muse process itself — which does inherit our spawn environment —
  // rather than by the plugin server, which inherits nothing.
  it("turns muse's plugin support on for the session", () => {
    spawn(["render"]);
    expect(lastEnv().MUSE_EXPERIMENTAL_PLUGINS).toBe("1");
  });

  // And nothing else: a variable set here for the BRIDGE would be dropped on the way, which is the
  // mistake this design replaced. If one is ever added, it is for muse itself.
  it("does not pretend the bridge can be told anything through the environment", () => {
    spawn(["render"]);
    expect(lastEnv().MULMOTERMINAL_SESSION_ID).toBeUndefined();
    expect(lastEnv().MULMOTERMINAL_TOOL_GROUPS).toBeUndefined();
  });
});
