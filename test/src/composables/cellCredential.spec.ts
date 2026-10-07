import { describe, it, expect } from "vitest";
import { credentialOf } from "../../../src/composables/cellCredential";

describe("credentialOf (#2919)", () => {
  it("reads the short and the long name", () => {
    expect(credentialOf({ type: "credential", label: "SS", detail: "SS (me@example.com)" })).toEqual({ label: "SS", detail: "SS (me@example.com)" });
  });

  it("falls back to the label for a frame without a detail", () => {
    expect(credentialOf({ type: "credential", label: "SS" })).toEqual({ label: "SS", detail: "SS" });
  });

  it.each([[{ type: "credential", label: null }], [{ type: "credential" }], [{ type: "credential", label: 3 }]])("is none for %j", (msg) => {
    expect(credentialOf(msg)).toBeNull();
  });
});
