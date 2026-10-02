// Which worktrees the Processes page offers to remove: only one with nothing to lose and nobody in it.
import { describe, it, expect } from "vitest";
import { cleanupBlockers, isCleanupCandidate, readWorktreeCleanupBody, type WorktreeCleanupRow } from "../../common/worktreeCleanup";

const CLEAN: WorktreeCleanupRow = { repo: "/r", base: "main", path: "/wt/a", branch: "agent/a", exists: true, dirty: false, merged: true, inUse: false };

describe("cleanupBlockers", () => {
  it("is empty for a merged, clean, unused worktree that exists", () => {
    expect(cleanupBlockers(CLEAN)).toEqual([]);
    expect(isCleanupCandidate(CLEAN)).toBe(true);
  });

  it.each([
    ["missing", { exists: false }],
    ["dirty", { dirty: true }],
    ["unmerged", { merged: false }],
    ["inUse", { inUse: true }],
  ] as const)("names %s", (blocker, change) => {
    const row = { ...CLEAN, ...change };
    expect(cleanupBlockers(row)).toEqual([blocker]);
    expect(isCleanupCandidate(row)).toBe(false);
  });

  it("lists every blocker, in a fixed order", () => {
    expect(cleanupBlockers({ ...CLEAN, exists: false, dirty: true, merged: false, inUse: true })).toEqual(["missing", "dirty", "unmerged", "inUse"]);
  });
});

describe("readWorktreeCleanupBody", () => {
  it("reads the rows", () => {
    expect(readWorktreeCleanupBody({ worktrees: [CLEAN, { ...CLEAN, branch: null }] })).toEqual([CLEAN, { ...CLEAN, branch: null }]);
  });

  it("drops a row it cannot read, keeping the rest", () => {
    expect(readWorktreeCleanupBody({ worktrees: [CLEAN, { ...CLEAN, dirty: "no" }, null] })).toEqual([CLEAN]);
  });

  it.each([null, "x", {}, { worktrees: "x" }])("is null for %j", (body) => {
    expect(readWorktreeCleanupBody(body)).toBeNull();
  });
});
