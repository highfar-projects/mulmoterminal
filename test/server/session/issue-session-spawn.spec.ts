// @vitest-environment node
// An issue session is a PROJECT cell for whichever agent was asked for (#2228): each agent has to
// reach its OWN spawner, with the directory's GUI tool groups rather than the full toolset, and
// cursor's file has to be written and approved before cursor starts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TERMINAL_AGENTS, type TerminalAgent } from "../../../common/sessionAgent";
import type { ToolGroup } from "../../../common/toolGroups";

const wouldReattach = vi.hoisted(() => ({ value: false }));
vi.mock("../../../server/session/pty-spawn.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ptyWouldReattach: () => wouldReattach.value,
}));

const { createIssueSessionSpawner, requestedIssueAgent } = await import("../../../server/session/issue-session-spawn.js");

const GROUPS: readonly ToolGroup[] = ["render"];
const CWD = "/wt/7-thing";
const SEED = "GitHub issue #7: The thing";

function setup() {
  const calls: Array<{ spawner: string; args: unknown[] }> = [];
  const order: string[] = [];
  const record =
    (spawner: string) =>
    (...args: unknown[]) => {
      calls.push({ spawner, args });
      order.push(`spawn:${spawner}`);
      return {} as never;
    };
  const syncCursorMcp = vi.fn(async (cwd: string, groups: readonly ToolGroup[]) => {
    order.push(`sync:${cwd}:${groups.join(",")}`);
  });
  const groupsFor = vi.fn(async () => {
    order.push("groups");
    return GROUPS;
  });
  const reserveWorktreeEnv = vi.fn(async (cwd: string) => {
    order.push(`reserve:${cwd}`);
  });
  const spawn = createIssueSessionSpawner({
    spawnClaudePty: record("claude"),
    spawnCodexPty: record("codex"),
    spawnCopilotPty: record("copilot"),
    spawnCursorPty: record("cursor"),
    spawnAntigravityPty: record("antigravity"),
    spawnGrokPty: record("grok"),
    spawnMusePty: record("muse"),
    groupsFor,
    syncCursorMcp,
    reserveWorktreeEnv,
    newSessionId: () => "s-1",
  });
  return { spawn, calls, order, syncCursorMcp, groupsFor, reserveWorktreeEnv };
}

beforeEach(() => {
  wouldReattach.value = false;
});

describe("createIssueSessionSpawner", () => {
  it.each(TERMINAL_AGENTS)("starts %s through its own spawner, and nothing else", async (agent) => {
    const { spawn, calls } = setup();
    const session = await spawn(agent, CWD, SEED, false);
    expect(calls.map((c) => c.spawner)).toEqual([agent]);
    expect(session).toMatchObject({ sessionId: "s-1", agent });
  });

  // The desktop's draft, the phone's run (#1253): Claude's two shapes, never both keys at once.
  it("gives Claude the seed as a draft, or as a first turn when asked to run", async () => {
    const { spawn, calls } = setup();
    await spawn("claude", CWD, SEED, false);
    await spawn("claude", CWD, SEED, true);
    expect(calls[0].args).toEqual(["s-1", null, null, { cwd: CWD, attachGuiMcp: false, draft: SEED }]);
    expect(calls[1].args).toEqual(["s-1", null, null, { cwd: CWD, attachGuiMcp: false, initialPrompt: SEED }]);
  });

  // attachGuiMcp:false is what makes these a project cell rather than a GUI-started chat.
  it.each(["codex", "copilot"] as const)("gives %s the directory's groups and not the full toolset", async (agent) => {
    const { spawn, calls, groupsFor } = setup();
    await spawn(agent, CWD, SEED, false);
    expect(groupsFor).toHaveBeenCalledWith(CWD);
    expect(calls[0].args).toEqual(["s-1", null, null, CWD, false, { mcpGroups: GROUPS, initialPrompt: SEED }]);
  });

  it.each(["antigravity", "grok", "muse"] as const)("gives %s the directory's groups", async (agent) => {
    const { spawn, calls } = setup();
    await spawn(agent, CWD, SEED, false);
    expect(calls[0].args).toEqual(["s-1", null, null, CWD, { mcpGroups: GROUPS, initialPrompt: SEED }]);
  });

  // Cursor loads only APPROVED servers and an unapproved one is silently absent, so the order is the
  // behaviour: written and approved first, spawned after.
  it("writes and approves cursor's directory file before starting cursor", async () => {
    const { spawn, calls, order } = setup();
    await spawn("cursor", CWD, SEED, false);
    expect(order).toEqual([`reserve:${CWD}`, "groups", `sync:${CWD}:render`, "spawn:cursor"]);
    expect(calls[0].args).toEqual(["s-1", null, null, CWD, { mcpGroups: GROUPS, initialPrompt: SEED }]);
  });

  // The file is shared by every cursor session in the directory; a session that would only reattach
  // must not rewrite it (spawn-directory-mcp.ts).
  it("leaves cursor's file alone when the session would only reattach", async () => {
    wouldReattach.value = true;
    const { spawn, syncCursorMcp } = setup();
    await spawn("cursor", CWD, SEED, false);
    expect(syncCursorMcp).not.toHaveBeenCalled();
  });

  // A reopened worktree may never have had its PORT / DB_NAME written; a cell's fresh spawn reserves
  // them first, and so does this, for every agent (#1367).
  it.each(TERMINAL_AGENTS)("reserves the worktree's env before starting %s", async (agent) => {
    const { spawn, order } = setup();
    await spawn(agent, CWD, SEED, false);
    expect(order[0]).toBe(`reserve:${CWD}`);
    expect(order.at(-1)).toBe(`spawn:${agent}`);
  });

  // Only a Claude draft waits for an Enter; every other seed is already running.
  it.each(TERMINAL_AGENTS.flatMap((agent) => [false, true].map((run) => [agent, run] as const)))(
    "reports whether %s's seed runs (run=%s)",
    async (agent, run) => {
      const { spawn } = setup();
      const session = await spawn(agent, CWD, SEED, run);
      expect(session.seedRuns).toBe(agent !== "claude" || run);
    },
  );
});

describe("requestedIssueAgent", () => {
  it("reads an absent agent as Claude", () => {
    expect(requestedIssueAgent(undefined)).toBe("claude");
  });

  it.each(TERMINAL_AGENTS)("accepts %s", (agent: TerminalAgent) => {
    expect(requestedIssueAgent(agent)).toBe(agent);
  });

  // Refused rather than coerced: a caller that named an agent meant that one.
  it.each([null, "", "Claude", "CODEX", " codex", "gemini", "shell", 0, 1, true, {}, ["codex"], { agent: "codex" }])("refuses %j", (raw) => {
    expect(requestedIssueAgent(raw)).toBeNull();
  });
});
