import { describe, it, expect } from "vitest";
import { MAX_RECENT_DIRS, MAX_RECENT_FILES, parseRecentStore, recentFor, recordRecent, type RecentFiles } from "../../../src/components/filesRecent";

const record = (store: RecentFiles[], cwd: string, ...paths: string[]): RecentFiles[] => paths.reduce((acc, path) => recordRecent(acc, cwd, path), store);

describe("recordRecent", () => {
  it("puts the newest file first", () => {
    expect(recentFor(record([], "/p", "a.md", "b.md", "c.md"), "/p")).toEqual(["c.md", "b.md", "a.md"]);
  });

  it("moves a file opened again to the front instead of listing it twice", () => {
    expect(recentFor(record([], "/p", "a.md", "b.md", "a.md"), "/p")).toEqual(["a.md", "b.md"]);
  });

  it("keeps each directory's list apart", () => {
    const store = record(record([], "/p", "a.md"), "/q", "x.md");
    expect(recentFor(store, "/p")).toEqual(["a.md"]);
    expect(recentFor(store, "/q")).toEqual(["x.md"]);
    expect(recentFor(store, "/r")).toEqual([]);
  });

  it("keeps at most MAX_RECENT_FILES per directory, dropping the oldest", () => {
    const paths = Array.from({ length: MAX_RECENT_FILES + 3 }, (_, i) => `f${i}.md`);
    const list = recentFor(record([], "/p", ...paths), "/p");
    expect(list).toHaveLength(MAX_RECENT_FILES);
    expect(list[0]).toBe(paths.at(-1));
    expect(list).not.toContain("f0.md");
  });

  it("keeps at most MAX_RECENT_DIRS directories, dropping the least recently used", () => {
    const dirs = Array.from({ length: MAX_RECENT_DIRS + 2 }, (_, i) => `/d${i}`);
    const store = dirs.reduce<RecentFiles[]>((acc, dir) => recordRecent(acc, dir, "a.md"), []);
    expect(store).toHaveLength(MAX_RECENT_DIRS);
    expect(recentFor(store, "/d0")).toEqual([]);
    expect(store[0].cwd).toBe(dirs.at(-1));
  });

  it("does not change the store it was given", () => {
    const store = record([], "/p", "a.md");
    recordRecent(store, "/p", "b.md");
    expect(recentFor(store, "/p")).toEqual(["a.md"]);
  });
});

describe("parseRecentStore", () => {
  it("reads back what was recorded", () => {
    const store = record(record([], "/p", "a.md", "b.md"), "/q", "x.md");
    expect(parseRecentStore(JSON.stringify(store))).toEqual(store);
  });

  it("starts empty from nothing, from JSON it cannot read, and from a value of the wrong shape", () => {
    for (const raw of [null, "", "{", "null", "42", '"x"', "{}"]) expect(parseRecentStore(raw)).toEqual([]);
  });

  it("drops entries and paths it cannot use, keeping the rest", () => {
    const raw = JSON.stringify([{ cwd: "/p", paths: ["a.md", 3, "", null, "a.md", "b.md"] }, { cwd: 1, paths: [] }, { cwd: "/q" }, "junk"]);
    expect(parseRecentStore(raw)).toEqual([{ cwd: "/p", paths: ["a.md", "b.md"] }]);
  });

  it("keeps at most MAX_RECENT_DIRS stored directories, the most recent first", () => {
    const stored = Array.from({ length: MAX_RECENT_DIRS + 4 }, (_, i) => ({ cwd: `/d${i}`, paths: ["a.md"] }));
    const store = parseRecentStore(JSON.stringify(stored));
    expect(store).toHaveLength(MAX_RECENT_DIRS);
    expect(store[0].cwd).toBe("/d0");
  });

  it("caps a stored list that is longer than this build keeps", () => {
    const paths = Array.from({ length: MAX_RECENT_FILES + 5 }, (_, i) => `f${i}.md`);
    expect(recentFor(parseRecentStore(JSON.stringify([{ cwd: "/p", paths }])), "/p")).toHaveLength(MAX_RECENT_FILES);
  });
});
