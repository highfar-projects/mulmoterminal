// @vitest-environment node
import { describe, it, expect } from "vitest";
import { rotationApplies, sessionCredential } from "../../../server/session/session-credential";
import { ROTATION_UNSET_ENV } from "../../../server/agents/token/token-assignment";

const PLAIN = { providerEnv: {}, runsCustomAgent: false, onAccount: false };
const assignment = { tokenId: "a", env: { CLAUDE_CODE_OAUTH_TOKEN: "s" }, unset: ROTATION_UNSET_ENV };

describe("rotationApplies (#2919)", () => {
  it("applies to a plain claude cell on the default home", () => {
    expect(rotationApplies(PLAIN)).toBe(true);
  });

  it.each([
    ["a provider session", { ...PLAIN, providerEnv: { ANTHROPIC_AUTH_TOKEN: "p" } }],
    ["a custom agent", { ...PLAIN, runsCustomAgent: true }],
    ["an account session", { ...PLAIN, onAccount: true }],
  ])("never applies to %s", (_name, eligibility) => {
    expect(rotationApplies(eligibility)).toBe(false);
  });
});

describe("sessionCredential", () => {
  const plainResolved = { model: null, env: {}, unset: [] };

  it("lays the token over the default resolution", () => {
    expect(sessionCredential(plainResolved, PLAIN, () => assignment)).toEqual({
      env: { CLAUDE_CODE_OAUTH_TOKEN: "s" },
      unset: ROTATION_UNSET_ENV,
      tokenId: "a",
    });
  });

  it("leaves the resolution alone, and asks nothing, when rotation does not apply", () => {
    const provider = { model: "m", env: { ANTHROPIC_AUTH_TOKEN: "p" }, unset: ["ANTHROPIC_API_KEY"] };
    let asked = false;
    const credential = sessionCredential(provider, { ...PLAIN, providerEnv: provider.env }, () => ((asked = true), assignment));
    expect(credential).toEqual({ env: provider.env, unset: provider.unset, tokenId: null });
    expect(asked).toBe(false);
  });

  it("leaves the resolution alone when rotation assigns nothing", () => {
    expect(sessionCredential(plainResolved, PLAIN, () => null)).toEqual({ env: {}, unset: [], tokenId: null });
  });

  it("does not repeat a name in unset", () => {
    const resolved = { model: null, env: {}, unset: ["ANTHROPIC_API_KEY"] };
    const unset = sessionCredential(resolved, PLAIN, () => assignment).unset;
    expect(unset.filter((name) => name === "ANTHROPIC_API_KEY")).toHaveLength(1);
  });
});
