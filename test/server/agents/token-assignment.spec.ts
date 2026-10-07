// @vitest-environment node
import { describe, it, expect } from "vitest";
import { assignToken, OAUTH_TOKEN_ENV, ROTATION_UNSET_ENV, type TokenAssignmentDeps } from "../../../server/agents/token-assignment";
import { DEFAULT_LOGIN_ID, type RotationToken, type TokenRotation } from "../../../common/tokenRotation";
import type { RateLimits } from "../../../common/rateLimits";

const NOW = 1_800_000_000;
const DAY = 86_400;
const A: RotationToken = { id: "a", label: "A", keychain: "k-a" };
const B: RotationToken = { id: "b", label: "B", file: "/t/b" };
const used = (percent: number, resetIn_sec = 3 * DAY): RateLimits => ({
  fiveHour: null,
  sevenDay: { usedPercentage: percent, resetsAt_sec: NOW + resetIn_sec },
});

const deps = (rotation: Partial<TokenRotation>, over: Partial<TokenAssignmentDeps> = {}): TokenAssignmentDeps => ({
  rotation: { enabled: true, includeDefaultLogin: true, tokens: [A, B], ...rotation },
  defaultLoginLimits: () => used(90),
  tokenLimits: (token) => (token.id === "a" ? used(50) : used(10)),
  readSecret: (token) => `secret-${token.id}`,
  now_sec: NOW,
  ...over,
});

describe("assignToken (#2919)", () => {
  it("is null while rotation is off, whatever the tokens", () => {
    expect(assignToken(deps({ enabled: false }))).toBeNull();
  });

  it("hands the chosen token as CLAUDE_CODE_OAUTH_TOKEN and unsets what would outrank it", () => {
    expect(assignToken(deps({}))).toEqual({ tokenId: "b", env: { [OAUTH_TOKEN_ENV]: "secret-b" }, unset: ROTATION_UNSET_ENV });
  });

  it("chooses the /login credential with no env of its own", () => {
    const assignment = assignToken(deps({}, { defaultLoginLimits: () => used(0) }));
    expect(assignment).toEqual({ tokenId: DEFAULT_LOGIN_ID, env: {}, unset: ROTATION_UNSET_ENV });
  });

  it("leaves the /login credential out when told to", () => {
    expect(assignToken(deps({ includeDefaultLogin: false }, { defaultLoginLimits: () => used(0) }))?.tokenId).toBe("b");
  });

  it("falls to the next candidate when the chosen token cannot be read", () => {
    const assignment = assignToken(deps({}, { readSecret: (token) => (token.id === "b" ? null : `secret-${token.id}`) }));
    expect(assignment?.tokenId).toBe("a");
  });

  it("is null when no token can be read and the /login credential is left out", () => {
    expect(assignToken(deps({ includeDefaultLogin: false }, { readSecret: () => null }))).toBeNull();
  });

  it("with only the /login credential, chooses it", () => {
    expect(assignToken(deps({ tokens: [] }))?.tokenId).toBe(DEFAULT_LOGIN_ID);
  });

  it("is null with nothing to choose from", () => {
    expect(assignToken(deps({ tokens: [], includeDefaultLogin: false }))).toBeNull();
  });

  it("passes spent marks through to the choice", () => {
    expect(assignToken(deps({}, { spentUntil_sec: (id) => (id === "b" ? NOW + DAY : null) }))?.tokenId).toBe("a");
  });

  it("never reads the secret of a token it did not choose", () => {
    const read: string[] = [];
    assignToken(deps({}, { readSecret: (token) => (read.push(token.id), `s-${token.id}`) }));
    expect(read).toEqual(["b"]);
  });
});
