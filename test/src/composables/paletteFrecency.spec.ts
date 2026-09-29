import { describe, it, expect } from "vitest";
import { FRECENCY_HALF_LIFE_MS, FRECENCY_MAX_ENTRIES, frecencyScore, isRemembered, readFrecency, recordUse } from "../../../src/composables/paletteFrecency";

const NOW = 1_000_000_000_000;

describe("frecencyScore", () => {
  it("is nothing for a row never used, and halves a week after the last use", () => {
    expect(frecencyScore(undefined, NOW)).toBe(0);
    expect(frecencyScore({ weight: 4, last: NOW }, NOW)).toBe(4);
    expect(frecencyScore({ weight: 4, last: NOW }, NOW + FRECENCY_HALF_LIFE_MS)).toBe(2);
  });

  it("does not grow for a use stamped in the future", () => {
    expect(frecencyScore({ weight: 4, last: NOW + 1000 }, NOW)).toBe(4);
  });
});

describe("recordUse", () => {
  it("adds one use to what is left of the earlier ones", () => {
    const once = recordUse({}, "zoom-toggle", NOW);
    expect(once["zoom-toggle"]).toEqual({ weight: 1, last: NOW });
    const again = recordUse(once, "zoom-toggle", NOW + FRECENCY_HALF_LIFE_MS);
    expect(again["zoom-toggle"]).toEqual({ weight: 1.5, last: NOW + FRECENCY_HALF_LIFE_MS });
  });

  it("keeps the strongest rows once full, dropping the weakest", () => {
    const full = Object.fromEntries(Array.from({ length: FRECENCY_MAX_ENTRIES }, (_, i) => [`k${i}`, { weight: i + 2, last: NOW }]));
    // A first use weighs 1, less than any kept row, so it is the one that goes.
    const fresh = recordUse(full, "new", NOW);
    expect(Object.keys(fresh)).toHaveLength(FRECENCY_MAX_ENTRIES);
    expect(fresh.new).toBeUndefined();
    // Used again, a row outgrows the weakest kept one, which goes instead.
    const grown = recordUse(full, "k0", NOW);
    const withNew = recordUse({ ...grown, new: { weight: 10, last: NOW } }, "k1", NOW);
    expect(Object.keys(withNew)).toHaveLength(FRECENCY_MAX_ENTRIES);
    expect(withNew.new).toBeDefined();
    expect(withNew[`k${FRECENCY_MAX_ENTRIES - 1}`]).toBeDefined();
  });
});

describe("readFrecency", () => {
  it("keeps well-formed entries and drops anything else", () => {
    const raw = { good: { weight: 2, last: NOW }, zero: { weight: 0, last: NOW }, nan: { weight: Number.NaN, last: NOW }, text: "x", noLast: { weight: 1 } };
    expect(readFrecency(raw)).toEqual({ good: { weight: 2, last: NOW } });
    expect(readFrecency(null)).toEqual({});
    expect(readFrecency([1, 2])).toEqual({});
  });
});

describe("isRemembered", () => {
  it("leaves out rows whose key names something else next time", () => {
    expect(["prompt", "handoff", "prefix", "terminal"].map((kind) => isRemembered({ kind }))).toEqual([false, false, false, false]);
    expect(isRemembered({ kind: "start", start: { kind: "launcher" } })).toBe(false);
  });

  it("keeps rows whose key names the same row next time", () => {
    expect(["action", "wiki", "github", "resume", "collection", "launch", "screen"].map((kind) => isRemembered({ kind }))).toEqual(Array(7).fill(true));
    expect(isRemembered({ kind: "start", start: { kind: "agent" } })).toBe(true);
  });
});
