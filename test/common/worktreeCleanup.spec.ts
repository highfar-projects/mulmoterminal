// Which worktrees the Processes page offers to remove: only one with nothing to lose and nobody in it.
import { describe, it, expect } from "vitest";
import {
  cleanupBlockers,
  isCleanupCandidate,
  parseIgnoredEntries,
  readConfirmedIgnored,
  readWorktreeCleanupBody,
  sameIgnored,
  worktreeStatus,
  type WorktreeCleanupRow,
} from "../../common/worktreeCleanup";

const CLEAN: WorktreeCleanupRow = {
  repo: "/r",
  base: "main",
  path: "/wt/a",
  branch: "agent/a",
  head: "abc",
  ignored: [],
  ignoredCount: 0,
  exists: true,
  dirty: false,
  merged: true,
  inUse: false,
};

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

describe("parseIgnoredEntries", () => {
  it("keeps the `!!` entries as printed, a directory as one entry", () => {
    expect(parseIgnoredEntries(["!! .env", " M src/a.ts", "?? new.txt", "!! node_modules/", "", "!! "].join("\n"))).toEqual([".env", "node_modules/"]);
  });

  it("is empty when nothing is ignored", () => {
    expect(parseIgnoredEntries("")).toEqual([]);
  });
});

describe("readWorktreeCleanupBody and ignored entries", () => {
  it.each([{ ignored: "x" }, { ignored: [1] }, { ignoredCount: "1" }])("drops a row whose ignored fields are %j", (change) => {
    expect(readWorktreeCleanupBody({ worktrees: [{ ...CLEAN, ...change }] })).toEqual([]);
  });
});

describe("worktreeStatus", () => {
  it.each([
    ["", { dirty: false, ignored: [] }],
    ["!! .env\n!! node_modules/\n", { dirty: false, ignored: [".env", "node_modules/"] }],
    ["?? new.txt\n!! .env\n", { dirty: true, ignored: [".env"] }],
    [" M src/a.ts\n", { dirty: true, ignored: [] }],
  ])("reads %j", (porcelain, expected) => {
    expect(worktreeStatus(porcelain)).toEqual(expected);
  });

  it("reads a status that failed as dirty, so it blocks removal", () => {
    expect(worktreeStatus(null)).toEqual({ dirty: true, ignored: [] });
    expect(isCleanupCandidate({ ...CLEAN, ...worktreeStatus(null), ignoredCount: 0 })).toBe(false);
  });
});

describe("confirmed ignored files", () => {
  it("reads them from a request body, or null when absent or malformed", () => {
    expect(readConfirmedIgnored({ ignored: [".env"], ignoredCount: 1 })).toEqual({ ignored: [".env"], ignoredCount: 1 });
    expect(readConfirmedIgnored({})).toBeNull();
    expect(readConfirmedIgnored({ ignored: [1], ignoredCount: 1 })).toBeNull();
    expect(readConfirmedIgnored({ ignored: [], ignoredCount: "0" })).toBeNull();
  });

  it.each([
    [{ ignored: [".env"], ignoredCount: 1 }, { ignored: [".env"], ignoredCount: 1 }, true],
    [{ ignored: [], ignoredCount: 0 }, { ignored: [".env"], ignoredCount: 1 }, false],
    [{ ignored: ["a"], ignoredCount: 21 }, { ignored: ["a"], ignoredCount: 22 }, false],
    [{ ignored: ["a"], ignoredCount: 1 }, { ignored: ["b"], ignoredCount: 1 }, false],
  ])("compares %j with %j: %s", (confirmed, now, same) => {
    expect(sameIgnored(confirmed, now)).toBe(same);
  });
});
