// @vitest-environment node
//
// The token log is read back at boot while spawns may already be happening (#2919). Each test loads
// the module afresh over its own HOME, because the read starts when the module is evaluated — so the
// import stays inside the test, after HOME is pointed somewhere.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ID = "11111111-2222-4333-8444-555555555555";
let home = "";
const realHome = process.env.HOME;
const logFile = () => path.join(home, ".mulmoterminal", "token-sessions.jsonl");

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "mt-token-sessions-"));
  mkdirSync(path.join(home, ".mulmoterminal"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  vi.resetModules();
});
afterEach(() => {
  process.env.HOME = realHome;
  rmSync(home, { recursive: true, force: true });
});

const load = async () => {
  const sessions = await import("../../../../server/session/credentials/token-sessions.js");
  const drain = await import("../../../../server/session/reaping/persist-drain.js");
  return { ...sessions, drain };
};

describe("token-sessions (#2919)", () => {
  it("reads the newest assignment back", async () => {
    writeFileSync(logFile(), `${JSON.stringify({ sessionId: ID, tokenId: "a" })}\n${JSON.stringify({ sessionId: ID, tokenId: "b" })}\n`);
    const { tokenSessionsHydrated, sessionToken } = await load();
    await tokenSessionsHydrated;
    expect(sessionToken(ID)).toBe("b");
  });

  it("keeps a non-rotated restart made before the log was read, in memory and on disk", async () => {
    writeFileSync(logFile(), `${JSON.stringify({ sessionId: ID, tokenId: "a" })}\n`);
    const { tokenSessionsHydrated, sessionToken, rememberTokenSession, drain } = await load();
    rememberTokenSession(ID, null);
    await tokenSessionsHydrated;
    await drain.drainPersistQueues();
    expect(sessionToken(ID)).toBeUndefined();
    const lines = readFileSync(logFile(), "utf8").trim().split("\n");
    expect(JSON.parse(lines.at(-1) ?? "{}")).toEqual({ sessionId: ID, tokenId: null });
  });

  it("does not append an unchanged assignment once the log is read", async () => {
    writeFileSync(logFile(), `${JSON.stringify({ sessionId: ID, tokenId: "a" })}\n`);
    const { tokenSessionsHydrated, rememberTokenSession, drain } = await load();
    await tokenSessionsHydrated;
    rememberTokenSession(ID, "a");
    await drain.drainPersistQueues();
    expect(readFileSync(logFile(), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
