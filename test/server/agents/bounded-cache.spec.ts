// @vitest-environment node
//
// The bound on the readers' per-session memo (#2123). Pure, so every case here is instant — which
// is the point: the same properties proved through a real reader cost 45 s of fixtures.
import { describe, it, expect } from "vitest";
import { rememberBounded } from "../../../server/agents/bounded-cache.js";

const fill = (cache: Map<string, string>, n: number, max: number): void => {
  for (let i = 0; i < n; i++) rememberBounded(cache, `k${i}`, `v${i}`, max);
};

describe("rememberBounded", () => {
  it("remembers what it was given, and hands it back", () => {
    const cache = new Map<string, string>();
    expect(rememberBounded(cache, "a", "one", 3)).toBe("one");
    expect(cache.get("a")).toBe("one");
  });

  it("never grows past the cap", () => {
    const cache = new Map<string, string>();
    fill(cache, 50, 8);
    expect(cache.size).toBe(8);
  });

  it("drops the oldest first, and keeps the newest", () => {
    const cache = new Map<string, string>();
    fill(cache, 4, 3);
    expect([...cache.keys()]).toEqual(["k1", "k2", "k3"]);
  });

  // A rewrite at capacity must replace its OWN entry. Without the delete-first it evicts the oldest
  // and re-adds the same key, so the map ends one short and an unrelated answer is gone.
  it("replacing a key at capacity evicts nothing else", () => {
    const cache = new Map<string, string>();
    fill(cache, 3, 3);
    rememberBounded(cache, "k1", "updated", 3);
    expect(cache.size).toBe(3);
    expect([...cache.keys()].sort()).toEqual(["k0", "k1", "k2"]);
    expect(cache.get("k1")).toBe("updated");
  });

  it("a cap of one keeps only the last", () => {
    const cache = new Map<string, string>();
    fill(cache, 5, 1);
    expect([...cache.entries()]).toEqual([["k4", "v4"]]);
  });
});
