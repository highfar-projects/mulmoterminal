// @vitest-environment node
import { describe, it, expect } from "vitest";
import { credentialFrameFor } from "../../../server/session/credential-frame.js";
import { DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, type TokenRotation } from "../../../common/tokenRotation.js";

const rotation = (over: Partial<TokenRotation> = {}): TokenRotation => ({
  enabled: true,
  includeDefaultLogin: false,
  tokens: [
    { id: "a", label: "A" },
    { id: "b", label: "Work", email: "w@example.com" },
  ],
  ...over,
});

describe("credentialFrameFor", () => {
  it("sends nothing while rotation is off", () => {
    expect(credentialFrameFor(rotation({ enabled: false }), "a")).toBeNull();
  });

  it("clears the mark for a session that is not on a token", () => {
    expect(credentialFrameFor(rotation(), undefined)).toEqual({ type: "credential", label: null, detail: null });
  });

  it("labels a token and names its address in the detail", () => {
    expect(credentialFrameFor(rotation(), "b")).toEqual({ type: "credential", label: "Work", detail: "Work (w@example.com)" });
    expect(credentialFrameFor(rotation(), "a")).toEqual({ type: "credential", label: "A", detail: "A" });
  });

  it("falls back to the id for a token gone from the config", () => {
    expect(credentialFrameFor(rotation(), "gone")).toEqual({ type: "credential", label: "gone", detail: "gone" });
  });

  it("names the /login credential", () => {
    expect(credentialFrameFor(rotation(), DEFAULT_LOGIN_ID)).toEqual({ type: "credential", label: DEFAULT_LOGIN_LABEL, detail: DEFAULT_LOGIN_LABEL });
  });
});
