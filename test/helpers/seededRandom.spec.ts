// @vitest-environment node
// The helper's own contract, which every spec that generates its inputs leans on without saying so:
// the same seed replays, the values stay in range, every value below a small bound is reached, and
// the sequence does not cycle within any run a spec makes.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vitestConfig from "../../vitest.config.js";
import { LCG_MULTIPLIER, seededRandom } from "./seededRandom.js";

const DRAWS = 100_000;
/** Consecutive draws compared as one: a repeated state repeats everything after it, while a single
 *  fraction carries few enough bits to recur by chance. */
const WINDOW = 4;
const REACH_DRAWS = 2000;
const SAMPLE = 10_000;

/** Where vitest collects specs from: every `.ts` under test/, since its helpers are the specs' code
 *  too, and the specs colocated with the code under the other roots. Pinned to the config below. */
const SPEC_ROOTS = [
  { root: "test", suffix: ".ts" },
  { root: "src", suffix: ".spec.ts" },
  { root: "server", suffix: ".spec.ts" },
  { root: "bin", suffix: ".spec.ts" },
];

const specFiles = ({ root, suffix }: { root: string; suffix: string }): string[] =>
  readdirSync(path.join(process.cwd(), root), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(entry.parentPath, entry.name));

/** Whether `source` spells the multiplier as a copied step keeps it: in decimal, as a BigInt or with
 *  numeric separators, or in hex. A multiplier computed or split across tokens is a rewrite, not a copy,
 *  and is not looked for. */
const spellsMultiplier = (source: string): boolean => {
  const plain = source.replace(/_/g, "").toLowerCase();
  return plain.includes(String(LCG_MULTIPLIER)) || plain.includes(`0x${LCG_MULTIPLIER.toString(16)}`);
};

/** The helper's fraction carries this many steps, so a draw scaled by it is the integer the state's upper
 *  bits hold, and a golden value can be written down exactly. */
const RESOLUTION = 2 ** 24;

const fractions = (seed: number, count: number): number[] => {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => random.fraction());
};

describe("seededRandom", () => {
  it("replays the same sequence for the same seed, and another for another", () => {
    expect(fractions(7, 64)).toEqual(fractions(7, 64));
    expect(fractions(7, 64)).not.toEqual(fractions(8, 64));
  });

  it("draws the sequence its constants fix, so a seed names the same inputs on every machine and in every year", () => {
    // From a BigInt reference of the step, written outside this file. Replay alone would stay green with
    // another increment or shift while every spec's generated inputs silently changed.
    const draws = (seed: number, count: number): number[] => {
      const random = seededRandom(seed);
      return Array.from({ length: count }, () => random.fraction() * RESOLUTION);
    };
    expect(draws(3214, 4)).toEqual([13085900, 6900392, 13736784, 2880611]);
    expect(draws(0, 2)).toEqual([48, 13884438]);
    expect(draws(0xffffffff, 2)).toEqual([12466657, 1128828]);
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

  it("picks only members", () => {
    const random = seededRandom(2);
    const choices = ["a", "b", "c"] as const;
    const picked = new Set(Array.from({ length: 300 }, () => random.pick(choices)));
    expect([...picked].sort()).toEqual([...choices]);
  });

  it("refuses an empty list, and any bound that is not a positive integer", () => {
    const random = seededRandom(2);
    expect(() => random.pick([])).toThrow();
    [0, -3, 0.5, 2.5, NaN, Infinity].forEach((bound) => expect(() => random.below(bound), `bound ${bound}`).toThrow());
    expect(random.below(1)).toBe(0);
  });

  it("scans every root vitest collects specs from", () => {
    const configured = (vitestConfig.test?.include ?? []).map((pattern) => pattern.split("/")[0]);
    expect([...new Set(configured)].sort()).toEqual(SPEC_ROOTS.map(({ root }) => root).sort());
  });

  it("recognises the spellings a copied step keeps, and not a neighbouring number", () => {
    const decimal = String(LCG_MULTIPLIER);
    const separated = LCG_MULTIPLIER.toLocaleString("en-US").replaceAll(",", "_");
    [decimal, `${decimal}n`, separated, `${separated}n`, `0x${LCG_MULTIPLIER.toString(16).toUpperCase()}`].forEach((form) =>
      expect(spellsMultiplier(`state = (state * ${form} + 12345) % 2147483648;`), form).toBe(true),
    );
    [String(LCG_MULTIPLIER + 1), decimal.slice(1), `0x${(LCG_MULTIPLIER + 1).toString(16)}`].forEach((form) =>
      expect(spellsMultiplier(`const n = ${form};`), form).toBe(false),
    );
  });

  it("has its multiplier spelled in no spec file but its own", () => {
    // The step is short enough to copy and quietly wrong when copied in doubles: a spec reaches it
    // through this helper or not at all.
    const carriers = SPEC_ROOTS.flatMap(specFiles)
      .filter((file) => spellsMultiplier(readFileSync(file, "utf-8")))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"));
    expect(carriers).toEqual(["test/helpers/seededRandom.ts"]);
  });
});
