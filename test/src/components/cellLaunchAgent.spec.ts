// @vitest-environment node
//
// The storage-vs-preference boundary, from the cell's side. `test/common/defaultAgent.spec.ts`
// pins the other side — that `storedCellAgent` never consults the setting — and this one pins
// which cells DO. Both directions matter and they fail differently: consulting it too widely
// relaunches every saved Claude cell as something else, and consulting it too narrowly leaves the
// first launcher a new user sees stuck on Claude (Codex round 8 of #2084).
import { describe, it, expect } from "vitest";
import { opensOnConfiguredDefault } from "../../../src/components/cellLaunchAgent";

const SESSION = "44444444-4444-4444-4444-444444444444";

describe("opensOnConfiguredDefault", () => {
  // The entry cell `ensureEntry` puts on an otherwise empty grid: no session, no agent, no wrapper.
  // This is the case the fix exists for and the first thing a new user sees.
  it("is true for a cell with nothing to restore", () => {
    expect(opensOnConfiguredDefault({ sessionId: null })).toBe(true);
    expect(opensOnConfiguredDefault({ sessionId: null, agent: null, customAgent: null })).toBe(true);
  });

  // THE REGRESSION THIS MUST NOT CAUSE. An absent agent on a cell that HAS a session is the
  // storage format saying claude; reading the setting there relaunches it as something else.
  it("is false for a restored session, whose absent agent means claude", () => {
    expect(opensOnConfiguredDefault({ sessionId: SESSION })).toBe(false);
    expect(opensOnConfiguredDefault({ sessionId: SESSION, agent: null })).toBe(false);
  });

  // A cell that says what it runs wins over the setting, session or not: it already answered.
  it.each(["codex", "antigravity", "grok", "muse", "copilot", "cursor", "claude"] as const)("is false for a cell storing agent %s", (agent) => {
    expect(opensOnConfiguredDefault({ sessionId: null, agent })).toBe(false);
    expect(opensOnConfiguredDefault({ sessionId: SESSION, agent })).toBe(false);
  });

  // A wrapper is a launch decision the user already made, and it reports agent "claude" while
  // running through a command line of its own (common/customAgents.ts) — so the agent field alone
  // cannot tell this case from an unstarted one.
  it("is false for a cell launched from a custom agent", () => {
    expect(opensOnConfiguredDefault({ sessionId: null, customAgent: "my-wrapper" })).toBe(false);
  });

  // A malformed wrapper id is not a wrapper. It falls through to the agent field, exactly as the
  // cell's own `isCustomAgentId` branch does, rather than pinning the picker to nothing.
  it.each([
    ["", "empty"],
    [" ", "blank"],
  ])("treats %j as no wrapper at all (%s)", (customAgent) => {
    expect(opensOnConfiguredDefault({ sessionId: null, customAgent })).toBe(true);
  });
});

// THE OTHER absence that means claude, and the one neither reviewer saw first. An explicit
// "launch Claude in this directory" from the phone or the launch panel is
// `{ session: null, autoStart: true }` with no agent field (src/components/launchCell.ts), so it
// matches every other clause here. Left unhandled, a request NAMING claude would have opened on
// the configured default and started it on mount without anyone pressing anything.
describe("opensOnConfiguredDefault and an auto-starting cell", () => {
  it("is false for a cell told to auto-start, whose absent agent also means claude", () => {
    expect(opensOnConfiguredDefault({ sessionId: null, autoStart: true })).toBe(false);
  });

  it("is still true for an idle launch cell, so the clause has not swallowed the entry cell", () => {
    expect(opensOnConfiguredDefault({ sessionId: null, autoStart: false })).toBe(true);
    expect(opensOnConfiguredDefault({ sessionId: null, autoStart: undefined })).toBe(true);
  });
});
