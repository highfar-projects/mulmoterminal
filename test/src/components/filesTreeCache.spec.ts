import { describe, it, expect } from "vitest";
import {
  parseTreeCache,
  rememberListing,
  recallListing,
  MAX_CACHED_DIRS,
  MAX_CACHED_ENTRIES,
  type CachedListing,
} from "../../../src/components/filesTreeCache";

// #2148 stage 2. The pane paints this while it re-reads, so every failure mode here has to degrade
// to "no paint" rather than to a wrong tree or a broken pane — which is why the parse is forgiving
// and why both caps are enforced on the way IN as well as on the way out.
const entries = (...names: string[]) => names.map((name) => ({ name, dir: false, size: 1 }));

describe("parseTreeCache", () => {
  it("reads back what rememberListing wrote", () => {
    const cache = rememberListing([], "/proj", entries("a.ts", "b.ts"));
    expect(parseTreeCache(JSON.stringify(cache))).toEqual(cache);
  });

  it.each([
    ["nothing stored yet", null],
    ["an empty string", ""],
    ["not JSON at all", "{half-written"],
    ["JSON that is not an array", '{"cwd":"/proj"}'],
  ])("returns nothing for %s", (_case, raw) => {
    expect(parseTreeCache(raw)).toEqual([]);
  });

  it.each([
    ["a missing cwd", '[{"entries":[]}]'],
    ["an empty cwd", '[{"cwd":"","entries":[]}]'],
    ["missing entries", '[{"cwd":"/proj"}]'],
    ["entries that are not an array", '[{"cwd":"/proj","entries":"a.ts"}]'],
    ["an entry with no name", '[{"cwd":"/proj","entries":[{"dir":false,"size":1}]}]'],
    ["an entry whose dir flag is a string", '[{"cwd":"/proj","entries":[{"name":"a","dir":"yes","size":1}]}]'],
  ])("drops an entry with %s", (_case, raw) => {
    expect(parseTreeCache(raw)).toEqual([]);
  });

  it("keeps the good directories and drops only the bad one", () => {
    const raw = JSON.stringify([{ cwd: "/a", entries: entries("x") }, { nonsense: true }, { cwd: "/b", entries: [] }]);
    expect(parseTreeCache(raw).map((c) => c.cwd)).toEqual(["/a", "/b"]);
  });

  // A value written by a build with larger caps — or by hand — must not come back over either
  // bound. The pane maps every entry it is handed into a node.
  it("caps the directory count it reads, not just what it writes", () => {
    const over = Array.from({ length: MAX_CACHED_DIRS + 5 }, (_, i) => ({ cwd: `/p${i}`, entries: [] }));
    expect(parseTreeCache(JSON.stringify(over))).toHaveLength(MAX_CACHED_DIRS);
  });

  it("caps the entries it reads too", () => {
    const huge = entries(...Array.from({ length: MAX_CACHED_ENTRIES + 500 }, (_, i) => `f${i}`));
    expect(parseTreeCache(JSON.stringify([{ cwd: "/proj", entries: huge }]))[0].entries).toHaveLength(MAX_CACHED_ENTRIES);
  });
});

describe("rememberListing", () => {
  it("puts the newest directory first", () => {
    const cache = rememberListing(rememberListing([], "/a", entries("a")), "/b", entries("b"));
    expect(cache.map((c) => c.cwd)).toEqual(["/b", "/a"]);
  });

  it("replaces a directory rather than appending a second entry", () => {
    const cache = rememberListing(rememberListing([], "/a", entries("old")), "/a", entries("new"));
    expect(cache).toHaveLength(1);
    expect(cache[0].entries.map((e) => e.name)).toEqual(["new"]);
  });

  it("drops the least recently used past the cap", () => {
    const full = Array.from({ length: MAX_CACHED_DIRS }, (_, i) => `/p${i}`).reduce<CachedListing[]>(
      (cache, cwd) => rememberListing(cache, cwd, entries("x")),
      [],
    );
    const after = rememberListing(full, "/fresh", entries("y"));
    expect(after).toHaveLength(MAX_CACHED_DIRS);
    expect(after[0].cwd).toBe("/fresh");
    expect(after.map((c) => c.cwd)).not.toContain("/p0"); // the oldest, evicted
  });

  it("trims a pathological listing", () => {
    const huge = entries(...Array.from({ length: MAX_CACHED_ENTRIES + 50 }, (_, i) => `f${i}`));
    expect(rememberListing([], "/proj", huge)[0].entries).toHaveLength(MAX_CACHED_ENTRIES);
  });
});

describe("recallListing", () => {
  it("finds the directory's own listing", () => {
    const cache = rememberListing(rememberListing([], "/a", entries("a.ts")), "/b", entries("b.ts"));
    expect(recallListing(cache, "/a")?.map((e) => e.name)).toEqual(["a.ts"]);
  });

  // An empty directory is a REAL answer and has to come back as one — `[]`, not null, or the pane
  // would show "Loading…" for a directory it knows to be empty.
  it("returns the empty listing it was given, not nothing", () => {
    expect(recallListing(rememberListing([], "/empty", []), "/empty")).toEqual([]);
  });

  it.each([
    ["a directory never seen", "/never"],
    ["no directory at all", null],
  ])("returns null for %s", (_case, cwd) => {
    expect(recallListing(rememberListing([], "/a", entries("a")), cwd)).toBeNull();
  });
});
