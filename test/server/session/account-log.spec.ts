// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isRecord } from "../../../common/isRecord";
import { accountSessionLine, accountSessionRecord, applyAccountSession, type AccountSession } from "../../../server/session/account-log";

const ID = "11111111-2222-4333-8444-555555555555";
const OTHER = "11111111-2222-4333-8444-666666666666";
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
const record: AccountSession = { sessionId: ID, agent: "claude", accountId: "work", home: "/Users/me/.claude-work" };

describe("account session log (#2215)", () => {
  it("round-trips a record through one line", () => {
    const parsed: unknown = JSON.parse(accountSessionLine(record));
    expect(isRecord(parsed) && accountSessionRecord(parsed, validId)).toEqual(record);
  });

  it("refuses each field that is malformed", () => {
    const bad: Record<string, unknown>[] = [
      { ...record, sessionId: "not-a-session" },
      { ...record, sessionId: 7 },
      { ...record, agent: "grok" },
      { ...record, accountId: "Work" },
      { ...record, home: "relative/home" },
      { ...record, home: "~/.claude-work" },
      { ...record, home: 3 },
      {},
    ];
    bad.forEach((line) => expect(accountSessionRecord(line, validId)).toBeNull());
  });

  it("keeps the FIRST binding of a session, since its transcript cannot move", () => {
    const sessions = new Map<string, AccountSession>();
    applyAccountSession(sessions, record);
    applyAccountSession(sessions, { ...record, accountId: "other", home: "/elsewhere" });
    applyAccountSession(sessions, { ...record, sessionId: OTHER });
    expect(sessions.get(ID)).toEqual(record);
    expect(sessions.size).toBe(2);
  });
});
