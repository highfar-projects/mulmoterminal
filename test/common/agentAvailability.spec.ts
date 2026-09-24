// The browser's reading of GET /api/agents/availability (#2230). Entry by entry: a malformed entry
// is dropped rather than the whole answer, and an agent with no entry reads as available.
import { describe, it, expect } from "vitest";
import { parseAgentAvailabilityResponse } from "../../common/agentAvailability";

const GUIDE = "https://dev.meta.ai/docs/muse-code";

describe("parseAgentAvailabilityResponse", () => {
  it("reads available and unavailable entries", () => {
    expect(
      parseAgentAvailabilityResponse({
        agents: [
          { agent: "claude", available: true },
          { agent: "muse", available: false, reason: "missing", installGuide: GUIDE },
        ],
      }),
    ).toEqual([
      { agent: "claude", available: true },
      { agent: "muse", available: false, reason: "missing", installGuide: GUIDE },
    ]);
  });

  it.each([null, undefined, "x", 1, [], {}, { agents: "x" }, { agents: {} }])("answers no entries for %j", (raw) => {
    expect(parseAgentAvailabilityResponse(raw)).toEqual([]);
  });

  it.each([
    ["an unknown agent", { agent: "gemini", available: true }],
    ["a shell", { agent: "shell", available: true }],
    ["a non-boolean available", { agent: "claude", available: "yes" }],
    ["an unknown reason", { agent: "muse", available: false, reason: "broken", installGuide: GUIDE }],
    ["an unavailable entry with no reason", { agent: "muse", available: false }],
    ["a non-object", "claude"],
  ])("drops %s and keeps the rest", (_case, bad) => {
    expect(parseAgentAvailabilityResponse({ agents: [bad, { agent: "codex", available: true }] })).toEqual([{ agent: "codex", available: true }]);
  });

  // It goes into an href: only an https URL is kept, and anything else becomes "no guide".
  it.each(["javascript:alert(1)", "http://example.test/install", "not a url", "", 42, null, undefined])("keeps no guide for %j", (installGuide) => {
    expect(parseAgentAvailabilityResponse({ agents: [{ agent: "muse", available: false, reason: "missing", installGuide }] })).toEqual([
      { agent: "muse", available: false, reason: "missing", installGuide: null },
    ]);
  });
});
