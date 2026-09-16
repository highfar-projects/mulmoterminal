// @vitest-environment node
import { describe, it, expect } from "vitest";
import { applyAccountSession, accountSessionLine, accountSessionRecord, type AccountSession } from "../../../server/session/account-log";
import { isAccountId } from "../../../common/accounts";

// Which account a session was started on, persisted so it outlives both the pty and the server —
// the transcript does, and a resume deliberately ignores the launch form's ACCOUNT select, so this
// file is the only thing that keeps a resumed conversation on the login it began on.

const SESSION = "11111111-2222-4333-8444-555555555555";
const isValidSessionId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

const parse = (line: string) => accountSessionRecord(JSON.parse(line) as Record<string, unknown>, isValidSessionId, isAccountId);

describe("accountSessionLine / accountSessionRecord", () => {
  it("round-trips a record through one line", () => {
    const record: AccountSession = { sessionId: SESSION, accountId: "work" };
    const line = accountSessionLine(record);
    expect(line.endsWith("\n")).toBe(true); // one record per line — the file is appended to, never rewritten
    expect(parse(line)).toEqual(record);
  });

  it("drops a line whose session id is not one", () => {
    expect(accountSessionRecord({ sessionId: "../../etc/passwd", accountId: "work" }, isValidSessionId, isAccountId)).toBeNull();
    expect(accountSessionRecord({ accountId: "work" }, isValidSessionId, isAccountId)).toBeNull();
  });

  // The id is looked up in the live config and never used directly as a path, but a name the
  // picker could not have produced has no business being carried either.
  it("drops a line whose account id the config would not accept", () => {
    expect(accountSessionRecord({ sessionId: SESSION, accountId: "Work" }, isValidSessionId, isAccountId)).toBeNull();
    expect(accountSessionRecord({ sessionId: SESSION }, isValidSessionId, isAccountId)).toBeNull();
  });

  // The log only grows: a session relaunched on another account appends a second line, and reading
  // in file order has to leave the LAST one standing — that is the one describing how it runs now.
  it("lets a later line win for the same session", () => {
    const sessions = new Map<string, string>();
    applyAccountSession(sessions, { sessionId: SESSION, accountId: "work" });
    applyAccountSession(sessions, { sessionId: SESSION, accountId: "personal" });
    expect(sessions.get(SESSION)).toBe("personal");
  });
});
