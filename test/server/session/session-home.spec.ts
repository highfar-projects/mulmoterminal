// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountSessionKey, type AccountSession } from "../../../server/session/account-log";

// The record is kept in memory here: the real module appends to ~/.mulmoterminal, which a spec must
// not touch. Its fold rule (first binding wins) is the one account-log.spec pins.
const store = vi.hoisted(() => ({ sessions: new Map<string, AccountSession>(), remembered: [] as AccountSession[] }));
vi.mock("../../../server/session/account-sessions.js", async () => {
  const { accountSessionKey: key } = await import("../../../server/session/account-log");
  return {
    accountSessions: store.sessions,
    accountSessionsHydrated: Promise.resolve(),
    boundAccount: (agent: AccountSession["agent"], sessionId: string) => store.sessions.get(key(agent, sessionId)),
    rememberAccountSession: (record: AccountSession) => {
      store.remembered.push(record);
      if (!store.sessions.has(key(record.agent, record.sessionId))) store.sessions.set(key(record.agent, record.sessionId), record);
    },
  };
});

const {
  accountHome,
  accountSpawnEnv,
  agentHomeChoices,
  bindSessionAccount,
  claudeTranscriptFile,
  distinctAccounts,
  resolveWithAccount,
  sessionHome,
  setAccountsProvider,
} = await import("../../../server/session/session-home");
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

  it("binds the SECOND of two accounts that share a home, not the default", async () => {
    setAccountsProvider(() => [WORK, { ...WORK, id: "work2", label: "Work 2" }]);
    expect(await bindSessionAccount("claude", ID, "work2", nowhere)).toEqual({ accountId: "work2", home: workHome() });
  });

  it("treats an account pointing at the default home as the default — no binding, so no variable", async () => {
    setAccountsProvider(() => [{ ...WORK, home: "~/.claude" }]);
    expect(await bindSessionAccount("claude", ID, "work", nowhere)).toBeNull();
    expect(accountSpawnEnv("claude", ID)).toEqual({});
  });

  it("lets claude and codex bind the same id independently", async () => {
    await bindSessionAccount("claude", ID, "work", nowhere);
    expect(await bindSessionAccount("codex", ID, "cwork", nowhere)).toEqual({ accountId: "cwork", home: path.resolve("/srv/codex-work") });
    expect(sessionHome("claude", ID)).toBe(workHome());
    expect(sessionHome("codex", ID)).toBe(path.resolve("/srv/codex-work"));
  });

  it("keeps a session's first binding", async () => {
    store.sessions.set(accountSessionKey("claude", ID), { sessionId: ID, agent: "claude", accountId: "old", home: "/gone/home" });
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

describe("claudeTranscriptFile for a session nobody has opened here", () => {
  const cwd = path.resolve("/ws/app");
  const transcriptIn = (claudeHome: string) => path.join(claudeHome, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${ID}.jsonl`);
  const write = (file: string) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "{}\n");
  };

  it("reads a listed row from the account home it was found in", () => {
    write(transcriptIn(workHome()));
    expect(claudeTranscriptFile(cwd, ID)).toBe(transcriptIn(workHome()));
    expect(store.remembered).toEqual([]); // reading never binds
  });

  it("prefers the default home when both hold the id, and falls back to it when neither does", () => {
    expect(claudeTranscriptFile(cwd, ID)).toBe(transcriptIn(defaultClaude()));
    write(transcriptIn(workHome()));
    write(transcriptIn(defaultClaude()));
    expect(claudeTranscriptFile(cwd, ID)).toBe(transcriptIn(defaultClaude()));
  });

  it("reads the default home without looking elsewhere when no account is configured", () => {
    setAccountsProvider(() => []);
    write(transcriptIn(workHome()));
    expect(claudeTranscriptFile(cwd, ID)).toBe(transcriptIn(defaultClaude()));
  });
});

// Which accounts get a usage meter (#2215, part 4).
describe("distinctAccounts", () => {
  it("keeps config order across agents", () => {
    setAccountsProvider(() => [CODEX_WORK, WORK]);
    expect(distinctAccounts().map((account) => account.id)).toEqual(["cwork", "work"]);
  });

  it("keeps only the first of two accounts sharing a home — one login, one probe", () => {
    setAccountsProvider(() => [WORK, { ...WORK, id: "work2", label: "Work 2" }, CODEX_WORK]);
    expect(distinctAccounts().map((account) => account.id)).toEqual(["work", "cwork"]);
  });

  it("leaves out an account pointing at its agent's default home — it IS the default login", () => {
    setAccountsProvider(() => [{ ...WORK, home: "~/.claude" }, { ...CODEX_WORK, home: "~/.codex" }, WORK]);
    expect(distinctAccounts().map((account) => account.id)).toEqual(["work"]);
  });
});
