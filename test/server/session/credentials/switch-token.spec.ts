// @vitest-environment node
import { describe, it, expect } from "vitest";
import { decideSwitch } from "../../../../server/session/credentials/switch-token.js";
import {
  pinSwitchedToken,
  takeSwitchedToken,
  clearSwitchedToken,
  carrySwitchedToken,
  SWITCH_PIN_TTL_MS,
} from "../../../../server/session/credentials/token-switch-pins.js";
import { DEFAULT_LOGIN_ID, type TokenRotation } from "../../../../common/tokenRotation.js";

const rotation = (over: Partial<TokenRotation> = {}): TokenRotation => ({
  enabled: true,
  includeDefaultLogin: false,
  tokens: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  ...over,
});

describe("decideSwitch (#2950)", () => {
  it("accepts a configured token for a rotated session", () => {
    expect(decideSwitch(rotation(), "a", "b")).toEqual({ ok: true, tokenId: "b" });
  });

  it.each([[undefined], [null], [3], [""], ["nope"], [DEFAULT_LOGIN_ID]])("refuses %j as an unknown subscription", (requested) => {
    expect(decideSwitch(rotation(), "a", requested)).toMatchObject({ ok: false, status: 400 });
  });

  it("offers the /login credential only when it takes part", () => {
    expect(decideSwitch(rotation({ includeDefaultLogin: true }), "a", DEFAULT_LOGIN_ID)).toEqual({ ok: true, tokenId: DEFAULT_LOGIN_ID });
  });

  it("refuses while rotation is off", () => {
    expect(decideSwitch(rotation({ enabled: false }), "a", "b")).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses a session rotation did not start", () => {
    expect(decideSwitch(rotation(), undefined, "b")).toMatchObject({ ok: false, status: 409 });
  });
});

describe("token switch pins (#2950)", () => {
  it("hands the pick to the next spawn once", () => {
    pinSwitchedToken("s1", "b", 1000);
    expect(takeSwitchedToken("s1", 1001)).toBe("b");
    expect(takeSwitchedToken("s1", 1002)).toBeUndefined();
  });

  it("lets a pick expire, and the expired one is still consumed", () => {
    pinSwitchedToken("s2", "b", 1000);
    expect(takeSwitchedToken("s2", 1000 + SWITCH_PIN_TTL_MS + 1)).toBeUndefined();
    expect(takeSwitchedToken("s2", 1000 + SWITCH_PIN_TTL_MS + 2)).toBeUndefined();
  });

  it("keeps a pick at the edge of the window", () => {
    pinSwitchedToken("s3", "b", 1000);
    expect(takeSwitchedToken("s3", 1000 + SWITCH_PIN_TTL_MS)).toBe("b");
  });

  it("can be cleared, and belongs to one session", () => {
    pinSwitchedToken("s4", "b", 1000);
    pinSwitchedToken("s5", "a", 1000);
    clearSwitchedToken("s4");
    expect(takeSwitchedToken("s4", 1001)).toBeUndefined();
    expect(takeSwitchedToken("s5", 1001)).toBe("a");
  });

  it("follows the session to the id its reconnect was handed", () => {
    pinSwitchedToken("old", "b", 1000);
    carrySwitchedToken("old", "new");
    expect(takeSwitchedToken("old", 1001)).toBeUndefined();
    expect(takeSwitchedToken("new", 1001)).toBe("b");
  });

  it("carries nothing when there is no pick, or the id did not change", () => {
    carrySwitchedToken("none", "other");
    expect(takeSwitchedToken("other", 1001)).toBeUndefined();
    pinSwitchedToken("same", "b", 1000);
    carrySwitchedToken("same", "same");
    expect(takeSwitchedToken("same", 1001)).toBe("b");
  });
});
