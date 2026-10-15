// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { ToolGroup } from "../../../../common/toolGroups.js";
import {
  applyGuiGroupRestriction,
  guiGroupRestrictionLine,
  guiGroupRestrictionRecord,
} from "../../../../server/session/spawn/agents/gui-group-restriction-log.js";

const ID = "11111111-2222-4333-8444-555555555555";
const isValidSessionId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
const roundTrip = (line: string) => guiGroupRestrictionRecord(JSON.parse(line), isValidSessionId);

describe("the GUI group restriction log", () => {
  it("round-trips a restriction, an empty one included", () => {
    expect(roundTrip(guiGroupRestrictionLine({ sessionId: ID, groups: ["render", "data"] }))).toEqual({ sessionId: ID, groups: ["render", "data"] });
    expect(roundTrip(guiGroupRestrictionLine({ sessionId: ID, groups: [] }))).toEqual({ sessionId: ID, groups: [] });
  });

  it("writes one line per record", () => {
    expect(guiGroupRestrictionLine({ sessionId: ID, groups: ["media"] })).toMatch(/^[^\n]*\n$/);
  });

  it("drops a line with no usable session id or no list", () => {
    for (const parsed of [
      { sessionId: "nope", groups: [] },
      { groups: [] },
      { sessionId: ID },
      { sessionId: ID, groups: "render" },
      { sessionId: 7, groups: [] },
    ]) {
      expect(guiGroupRestrictionRecord(parsed, isValidSessionId)).toBeNull();
    }
  });

  // Voiding the line would read as "never restricted" and hand the session every tool, so a group
  // this build does not know NARROWS the restriction instead.
  it("keeps the known groups of a line naming one it does not know", () => {
    expect(guiGroupRestrictionRecord({ sessionId: ID, groups: ["render", "holograms", 3] }, isValidSessionId)).toEqual({ sessionId: ID, groups: ["render"] });
  });

  it("lets the newest line for a session win", () => {
    const restrictions = new Map<string, readonly ToolGroup[]>();
    applyGuiGroupRestriction(restrictions, { sessionId: ID, groups: ["render"] });
    applyGuiGroupRestriction(restrictions, { sessionId: ID, groups: [] });
    expect(restrictions.get(ID)).toEqual([]);
  });
});
