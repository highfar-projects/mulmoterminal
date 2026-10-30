// @vitest-environment node
// The helper's own contract, which every spec that generates its inputs leans on without saying so:
// the same seed replays, the values stay in range, every value below a small bound is reached, and
// the sequence does not cycle within any run a spec makes.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { LCG_MULTIPLIER, seededRandom } from "./seededRandom.js";

const DRAWS = 100_000;
/** Consecutive draws compared as one: a repeated state repeats everything after it, while a single
 *  fraction carries few enough bits to recur by chance. */
const WINDOW = 4;
const REACH_DRAWS = 2000;
const SAMPLE = 10_000;

const fractions = (seed: number, count: number): number[] => {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => random.fraction());
};

describe("seededRandom", () => {
  it("replays the same sequence for the same seed, and another for another", () => {
    expect(fractions(7, 64)).toEqual(fractions(7, 64));
    expect(fractions(7, 64)).not.toEqual(fractions(8, 64));
  });

  it("keeps fractions in [0, 1) and integers in [0, bound)", () => {
    const drawn = fractions(1, SAMPLE);
    expect(Math.min(...drawn)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...drawn)).toBeLessThan(1);
    const random = seededRandom(1);
    const below = Array.from({ length: SAMPLE }, () => random.below(7));
    expect(below.every((value) => Number.isInteger(value) && value >= 0 && value < 7)).toBe(true);
  });

  it("reaches every value below a small bound, powers of two included", () => {
    // A step done in doubles leaves the state on multiples of a power of two, and `below(4)` then
    // never moves while `below(7)` still seems to.
    [2, 4, 7, 8, 12, 64].forEach((bound) => {
      const random = seededRandom(3214);
      const seen = new Set(Array.from({ length: REACH_DRAWS }, () => random.below(bound)));
      expect(seen.size, `bound ${bound}`).toBe(bound);
    });
  });

  it("does not cycle within a hundred thousand draws", () => {
    const drawn = fractions(12345, DRAWS);
    const windows = new Set(Array.from({ length: DRAWS - WINDOW + 1 }, (_, at) => drawn.slice(at, at + WINDOW).join(",")));
    expect(windows.size).toBe(DRAWS - WINDOW + 1);
  });

  it("picks only members, and refuses an empty list", () => {
    const random = seededRandom(2);
    const choices = ["a", "b", "c"] as const;
    const picked = new Set(Array.from({ length: 300 }, () => random.pick(choices)));
    expect([...picked].sort()).toEqual([...choices]);
    expect(() => random.pick([])).toThrow();
  });

  it("is the only generator of its kind under test/", () => {
    // The step is short enough to copy and quietly wrong when copied in doubles: a spec reaches it
    // through this helper or not at all.
    const root = path.join(process.cwd(), "test");
    const carriers = readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => readFileSync(file, "utf-8").includes(String(LCG_MULTIPLIER)))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"));
    expect(carriers).toEqual(["test/helpers/seededRandom.ts"]);
  });
});
