// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createAppendFileCache, createFileCache } from "../../../server/session/file-cache.js";

const stamp = (mtimeMs: number, size: number) => ({ mtimeMs, size });

describe("createFileCache", () => {
  it("returns undefined on a cold key", () => {
    const c = createFileCache<number>();
    expect(c.get("a", stamp(1, 10))).toBeUndefined();
  });

  it("returns the cached value while (mtime, size) is unchanged", () => {
    const c = createFileCache<string>();
    c.set("a", stamp(1, 10), "v1");
    expect(c.get("a", stamp(1, 10))).toBe("v1");
  });

  it("misses when mtime changes", () => {
    const c = createFileCache<string>();
    c.set("a", stamp(1, 10), "v1");
    expect(c.get("a", stamp(2, 10))).toBeUndefined();
  });

  it("misses when size changes at the same mtime (sub-tick rewrite)", () => {
    const c = createFileCache<string>();
    c.set("a", stamp(1, 10), "v1");
    expect(c.get("a", stamp(1, 11))).toBeUndefined();
  });

  it("overwrites a key's value+stamp on re-set", () => {
    const c = createFileCache<string>();
    c.set("a", stamp(1, 10), "v1");
    c.set("a", stamp(2, 20), "v2");
    expect(c.get("a", stamp(2, 20))).toBe("v2");
    expect(c.get("a", stamp(1, 10))).toBeUndefined();
  });

  it("evicts the least-recently-used key past the cap", () => {
    const c = createFileCache<string>(2);
    c.set("a", stamp(1, 1), "va");
    c.set("b", stamp(1, 1), "vb");
    c.get("a", stamp(1, 1)); // touch a → b is now LRU
    c.set("c", stamp(1, 1), "vc"); // over cap → evict b
    expect(c.get("a", stamp(1, 1))).toBe("va");
    expect(c.get("c", stamp(1, 1))).toBe("vc");
    expect(c.get("b", stamp(1, 1))).toBeUndefined();
  });
});

// The append-only variant (#1377): an unchanged file is not the only cheap case — a file that GREW
// can be caught up from where the last scan stopped, which is what stops the session list from
// re-reading gigabytes it has already read.
describe("createAppendFileCache", () => {
  it("resumes nothing for a cold key", () => {
    const c = createAppendFileCache<string>();
    expect(c.resume("a", stamp(1, 10))).toBeUndefined();
  });

  it("resumes at the stored offset while the file is unchanged", () => {
    const c = createAppendFileCache<string>();
    c.set("a", stamp(1, 10), 10, "v1");
    expect(c.resume("a", stamp(1, 10))).toEqual({ from: 10, value: "v1" });
  });

  it("resumes at the stored offset for a file that grew", () => {
    const c = createAppendFileCache<string>();
    c.set("a", stamp(1, 10), 10, "v1");
    expect(c.resume("a", stamp(2, 40))).toEqual({ from: 10, value: "v1" });
  });

  // Shorter than what was folded: cleared, rotated, or replaced. Resuming would fold new records
  // on top of a value describing a file that no longer exists.
  it("resumes nothing when the file got shorter", () => {
    const c = createAppendFileCache<string>();
    c.set("a", stamp(1, 40), 40, "v1");
    expect(c.resume("a", stamp(2, 10))).toBeUndefined();
  });

  // Same length, written again: an in-place rewrite, which mtime is the only witness to.
  it("resumes nothing when the file was rewritten at the same size", () => {
    const c = createAppendFileCache<string>();
    c.set("a", stamp(1, 10), 10, "v1");
    expect(c.resume("a", stamp(2, 10))).toBeUndefined();
  });

  it("evicts the least-recently-used key past the cap", () => {
    const c = createAppendFileCache<string>(2);
    c.set("a", stamp(1, 1), 1, "a");
    c.set("b", stamp(1, 1), 1, "b");
    c.resume("a", stamp(1, 1)); // touch a, so b is the oldest
    c.set("c", stamp(1, 1), 1, "c");
    expect(c.resume("a", stamp(1, 1))).toEqual({ from: 1, value: "a" });
    expect(c.resume("b", stamp(1, 1))).toBeUndefined();
    expect(c.resume("c", stamp(1, 1))).toEqual({ from: 1, value: "c" });
  });
});
