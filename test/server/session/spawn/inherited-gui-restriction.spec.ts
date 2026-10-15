// @vitest-environment node
import { describe, expect, it } from "vitest";
import { inheritedGuiRestriction } from "../../../../server/session/spawn/agents/inherited-gui-restriction.js";
import type { ToolGroup } from "../../../../common/toolGroups.js";

const ROLLOUT = "rollout-1";
const held = (sessionId: string, conversationId = ROLLOUT) => ({ sessionId, conversationId, cwd: "/w", startedAt: 1 });
const restrictions = (entries: Record<string, readonly ToolGroup[]>) => (sessionId: string) => entries[sessionId] ?? null;

describe("inheritedGuiRestriction", () => {
  it("is null when nothing holds the rollout", () => {
    expect(inheritedGuiRestriction(ROLLOUT, [], restrictions({}))).toBeNull();
    expect(inheritedGuiRestriction(ROLLOUT, [held("a", "other")], restrictions({ a: ["render"] }))).toBeNull();
  });

  it("is null when no session holding it was limited", () => {
    expect(inheritedGuiRestriction(ROLLOUT, [held("a"), held("b")], restrictions({}))).toBeNull();
  });

  it("is the restriction of the session holding it, an empty one included", () => {
    expect(inheritedGuiRestriction(ROLLOUT, [held("a")], restrictions({ a: ["render", "data"] }))).toEqual(["render", "data"]);
    expect(inheritedGuiRestriction(ROLLOUT, [held("a")], restrictions({ a: [] }))).toEqual([]);
  });

  it("ignores an unrestricted holder beside a restricted one, rather than widening", () => {
    expect(inheritedGuiRestriction(ROLLOUT, [held("a"), held("b")], restrictions({ b: ["media"] }))).toEqual(["media"]);
  });

  it("takes the narrowest when several holders were limited differently", () => {
    const entries = restrictions({ a: ["render", "data"], b: ["data", "media"] });
    expect(inheritedGuiRestriction(ROLLOUT, [held("a"), held("b")], entries)).toEqual(["data"]);
    expect(inheritedGuiRestriction(ROLLOUT, [held("a"), held("c")], restrictions({ a: ["render"], c: ["media"] }))).toEqual([]);
  });

  it("only reads the holders of this rollout", () => {
    const entries = restrictions({ a: ["render"], b: ["media"] });
    expect(inheritedGuiRestriction(ROLLOUT, [held("a"), held("b", "other")], entries)).toEqual(["render"]);
  });
});
