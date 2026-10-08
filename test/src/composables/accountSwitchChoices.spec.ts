import { describe, it, expect } from "vitest";
import { accountSwitchChoices } from "../../../src/composables/accountSwitchChoices";
import { DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, type TokenRotation } from "../../../common/tokenRotation";

const rotation = (over: Partial<TokenRotation> = {}): TokenRotation => ({
  enabled: true,
  includeDefaultLogin: false,
  tokens: [
    { id: "a", label: "A", email: "a@example.com" },
    { id: "b", label: "B" },
  ],
  ...over,
});

describe("accountSwitchChoices (#2950)", () => {
  it("lists the tokens and marks the current one", () => {
    expect(accountSwitchChoices(rotation(), "b")).toEqual([
      { id: "a", label: "A", detail: "a@example.com", current: false },
      { id: "b", label: "B", detail: null, current: true },
    ]);
  });

  it("adds the /login credential only when it takes part", () => {
    expect(accountSwitchChoices(rotation({ includeDefaultLogin: true }), DEFAULT_LOGIN_ID).at(-1)).toEqual({
      id: DEFAULT_LOGIN_ID,
      label: DEFAULT_LOGIN_LABEL,
      detail: null,
      current: true,
    });
  });

  it("offers nothing with rotation off or for a cell not on a rotated token", () => {
    expect(accountSwitchChoices(rotation({ enabled: false }), "a")).toEqual([]);
    expect(accountSwitchChoices(rotation(), null)).toEqual([]);
  });
});
