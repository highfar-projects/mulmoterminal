// @vitest-environment node
import { describe, it, expect } from "vitest";
import { applyTokenSession, tokenSessionLine, tokenSessionRecord } from "../../../server/session/token-session-log";
import { DEFAULT_LOGIN_ID } from "../../../common/tokenRotation";

const ID = "11111111-2222-4333-8444-555555555555";
const valid = (id: string) => id === ID;
const parse = (line: string) => tokenSessionRecord(JSON.parse(line), valid);

describe("token-session log (#2919)", () => {
  it("round-trips a token, the /login credential, and a non-rotated process", () => {
    ["a", DEFAULT_LOGIN_ID, null].forEach((tokenId) => {
      expect(parse(tokenSessionLine({ sessionId: ID, tokenId }))).toEqual({ sessionId: ID, tokenId });
    });
  });

  it.each([
    ["a bad session id", { sessionId: "x", tokenId: "a" }],
    ["a bad token id", { sessionId: ID, tokenId: "A B" }],
    ["a missing token id", { sessionId: ID }],
    ["a numeric token id", { sessionId: ID, tokenId: 3 }],
  ])("drops %s", (_name, parsed) => {
    expect(tokenSessionRecord(parsed, valid)).toBeNull();
  });

  it("lets the newest line win, and a null line end the assignment", () => {
    const sessions = new Map<string, string>();
    applyTokenSession(sessions, { sessionId: ID, tokenId: "a" });
    applyTokenSession(sessions, { sessionId: ID, tokenId: "b" });
    expect(sessions.get(ID)).toBe("b");
    applyTokenSession(sessions, { sessionId: ID, tokenId: null });
    expect(sessions.has(ID)).toBe(false);
  });
});
