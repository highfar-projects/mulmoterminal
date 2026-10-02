// A document gate is not approved while its last revision's files fail the check of the step that wrote them.
import { describe, it, expect } from "vitest";
import { lastRevisionCheckFailed } from "../../../common/blueprint/revisionCheck";

const entry = (outcome?: "reply" | "no-reply" | "lost" | "check-failed") => ({ role: "agent" as const, text: "", atMs: 1, ...(outcome ? { outcome } : {}) });

describe("lastRevisionCheckFailed", () => {
  it("holds only when the conversation's last entry is a failed check", () => {
    expect(lastRevisionCheckFailed([entry("reply"), entry("check-failed")])).toBe(true);
    expect(lastRevisionCheckFailed([entry("check-failed"), { role: "person", text: "直して", atMs: 2 }, entry("reply")])).toBe(false);
    expect(lastRevisionCheckFailed([entry("lost")])).toBe(false);
    expect(lastRevisionCheckFailed([])).toBe(false);
  });
});
