// @vitest-environment node
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountSession } from "../../../server/session/account-log";

// The record is kept in memory here: the real module appends to ~/.mulmoterminal, which a spec must
// not touch. Its fold rule (first binding wins) is the one account-log.spec pins.
const store = vi.hoisted(() => ({ sessions: new Map<string, AccountSession>(), remembered: [] as AccountSession[] }));
vi.mock("../../../server/session/account-sessions.js", () => ({
  accountSessions: store.sessions,
  accountSessionsHydrated: Promise.resolve(),
  rememberAccountSession: (record: AccountSession) => {
    store.remembered.push(record);
    if (!store.sessions.has(record.sessionId)) store.sessions.set(record.sessionId, record);
  },
}));

const { accountHome, accountSpawnEnv, agentHomeChoices, bindSessionAccount, resolveWithAccount, sessionHome, setAccountsProvider } =
  await import("../../../server/session/session-home");
const { takeScratchHome } = await import("../../support/scratchHome");

const ID = "11111111-2222-4333-8444-555555555555";
const WORK = { id: "work", label: "Work", agent: "claude" as const, home: "~/.claude-work" };
const CODEX_WORK = { id: "cwork", label: "Codex work", agent: "codex" as const, home: "/srv/codex-work" };

let home: ReturnType<typeof takeScratchHome>;
beforeEach(() => {
  home = takeScratchHome("session-home-");
  vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  vi.stubEnv("CODEX_HOME", undefined);
  store.sessions.clear();
  store.remembered.length = 0;
  setAccountsProvider(() => [WORK, CODEX_WORK]);
});
afterEach(() => {
  setAccountsProvider(() => []);
  vi.unstubAllEnvs();
  home.release();
});

const workHome = () => path.join(home.path, ".claude-work");
const defaultClaude = () => path.join(home.path, ".claude");

describe("accountHome", () => {
  it("expands ~/ against the user's home and leaves an absolute home alone", () => {
    expect(accountHome(WORK)).toBe(workHome());
    expect(accountHome(CODEX_WORK)).toBe(path.resolve("/srv/codex-work"));
  });

  it("spells a claude home in NFC, as claude does", () => {
    expect(accountHome({ ...WORK, home: "/srv/café" })).toBe(path.resolve("/srv/café").normalize("NFC"));
  });
});

describe("agentHomeChoices", () => {
  it("is only the default home when no account is configured", () => {
    setAccountsProvider(() => []);
    expect(agentHomeChoices("claude")).toEqual([{ accountId: null, home: defaultClaude() }]);
  });

  it("lists the default first, then this agent's accounts only", () => {
    expect(agentHomeChoices("claude")).toEqual([
      { accountId: null, home: defaultClaude() },
      { accountId: "work", home: workHome() },
    ]);
  });

  it("leaves out an account pointing at the default home", () => {
    setAccountsProvider(() => [{ ...WORK, home: "~/.claude" }]);
    expect(agentHomeChoices("claude")).toEqual([{ accountId: null, home: defaultClaude() }]);
  });
});

describe("bindSessionAccount", () => {
  const nowhere = () => false;

  it("binds a NEW session to the requested account", async () => {
    expect(await bindSessionAccount("claude", ID, "work", nowhere)).toEqual({ accountId: "work", home: workHome() });
    expect(sessionHome("claude", ID)).toBe(workHome());
  });

  it("binds nothing for a new session with no account, or an unknown one", async () => {
    expect(await bindSessionAccount("claude", ID, undefined, nowhere)).toBeNull();
    expect(await bindSessionAccount("claude", ID, "nope", nowhere)).toBeNull();
    expect(await bindSessionAccount("claude", ID, "cwork", nowhere)).toBeNull(); // codex's account, asked for claude
    expect(store.remembered).toEqual([]);
    expect(sessionHome("claude", ID)).toBe(defaultClaude());
  });

  it("runs an existing session where its transcript is, whatever was requested", async () => {
    expect(await bindSessionAccount("claude", ID, "work", (h) => h === defaultClaude())).toBeNull();
    expect(store.remembered).toEqual([]);
    expect(await bindSessionAccount("claude", ID, undefined, (h) => h === workHome())).toEqual({ accountId: "work", home: workHome() });
  });

  it("keeps a session's first binding", async () => {
    store.sessions.set(ID, { sessionId: ID, agent: "claude", accountId: "old", home: "/gone/home" });
    expect(await bindSessionAccount("claude", ID, "work", nowhere)).toEqual({ accountId: "old", home: "/gone/home" });
    expect(sessionHome("claude", ID)).toBe("/gone/home");
  });
});

describe("accountSpawnEnv", () => {
  it("sets NOTHING for a session on the default home — not even the default value", () => {
    expect(accountSpawnEnv("claude", ID)).toEqual({});
    expect(accountSpawnEnv("codex", ID)).toEqual({});
  });

  it("sets the agent's own variable for a bound session, and only for that agent", async () => {
    await bindSessionAccount("claude", ID, "work", () => false);
    expect(accountSpawnEnv("claude", ID)).toEqual({ CLAUDE_CONFIG_DIR: workHome() });
    expect(accountSpawnEnv("codex", ID)).toEqual({});
  });

  it("uses CODEX_HOME for codex", async () => {
    await bindSessionAccount("codex", ID, "cwork", () => false);
    expect(accountSpawnEnv("codex", ID)).toEqual({ CODEX_HOME: path.resolve("/srv/codex-work") });
  });
});

describe("resolveWithAccount", () => {
  const MINTED = "11111111-2222-4333-8444-999999999999";
  const nowhere = () => () => false;

  it("gives a session the resolve step MINTED the picked account", async () => {
    const resolution = await resolveWithAccount("claude", null, "work", nowhere, () => ({ sessionId: MINTED }));
    expect(resolution).toEqual({ sessionId: MINTED });
    expect(sessionHome("claude", MINTED)).toBe(workHome());
  });

  it("never gives a REQUESTED session the picked account — a reconnect re-sends what the cell held", async () => {
    await resolveWithAccount("claude", ID, "work", nowhere, () => ({ sessionId: ID }));
    expect(store.remembered).toEqual([]);
    expect(sessionHome("claude", ID)).toBe(defaultClaude());
  });

  it("binds a requested session to the home its transcript is in BEFORE resolving", async () => {
    let homeSeenByResolve = "";
    await resolveWithAccount(
      "claude",
      ID,
      undefined,
      () => (h) => h === workHome(),
      () => {
        homeSeenByResolve = sessionHome("claude", ID);
        return { sessionId: ID };
      },
    );
    expect(homeSeenByResolve).toBe(workHome());
  });

  it("binds the minted id, not the abandoned request, when a request cannot be served", async () => {
    await resolveWithAccount("claude", ID, "work", nowhere, () => ({ sessionId: MINTED }));
    expect(store.remembered.map((r) => r.sessionId)).toEqual([MINTED]);
  });
});
