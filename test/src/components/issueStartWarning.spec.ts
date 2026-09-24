// Pinned so a change is deliberate: which agents approve their own tools is a fact about how each is
// spawned (see issueStartWarning.ts for the lines it mirrors), and a wrong entry either hides the
// risk or cries wolf.
import { describe, it, expect } from "vitest";
import { issueStartWarning } from "../../../src/components/issueStartWarning";

describe("issueStartWarning", () => {
  it("says nothing for Claude, whose issue seed is a draft", () => {
    expect(issueStartWarning("claude")).toBe("none");
  });

  it("warns that Codex runs at once, without claiming it approves its tools", () => {
    expect(issueStartWarning("codex")).toBe("runsAtOnce");
  });

  it.each(["antigravity", "grok", "muse", "copilot", "cursor"] as const)("warns that %s runs at once with its tools auto-approved", (agent) => {
    expect(issueStartWarning(agent)).toBe("runsAtOnceAutoApproved");
  });
});
