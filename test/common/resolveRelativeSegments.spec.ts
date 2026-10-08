// @vitest-environment node
import { describe, it, expect } from "vitest";
import { resolveRelativeSegments } from "../../common/resolveRelativeSegments";

describe("resolveRelativeSegments", () => {
  it.each([
    ["a/b/c", "a/b/c"],
    ["a/./b", "a/b"],
    ["a//b/", "a/b"],
    ["/a/b", "a/b"],
    ["a/../b", "b"],
    ["a/b/../../c", "c"],
    ["a\\b", "a\\b"],
    ["~/x", "~/x"],
  ])("resolves %j to %j", (rel, expected) => {
    expect(resolveRelativeSegments(rel)).toBe(expected);
  });

  it.each([
    ["", "nothing at all"],
    [".", "the root itself"],
    ["a/..", "a path that cancels out"],
    ["..", "a climb above the root"],
    ["../a", "a climb above the root, even toward a file"],
    ["a/../../a", "a climb that comes back — it still left the root"],
    ["///", "separators only"],
  ])("answers null for %j (%s)", (rel) => {
    expect(resolveRelativeSegments(rel)).toBeNull();
  });
});

// Generated inputs against an oracle built from WHATWG URL resolution under a root, except that ANY
// moment above the root is null, and so is the root itself. A backslash is left out of the
// generator because URL treats it as a separator; the examples above pin it as an ordinary byte.
const SEGMENTS = ["a", "b", "..", ".", "", "x.png", "%20", "C:", "~"];
const ORACLE_ROOT = "https://oracle.invalid/root/";
const SEED = 2822;
const RUNS = 20000;

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function oracle(rel: string): string | null {
  const meaningful = rel.split("/").filter((segment) => segment !== "" && segment !== ".");
  const depths = meaningful.reduce<number[]>((acc, segment) => [...acc, (acc.at(-1) ?? 0) + (segment === ".." ? -1 : 1)], []);
  if (depths.some((depth) => depth < 0)) return null;
  const resolved = new URL(`./${meaningful.join("/")}`, ORACLE_ROOT).pathname.slice("/root/".length).replace(/\/$/, "");
  return resolved === "" ? null : resolved;
}

describe("resolveRelativeSegments over generated paths", () => {
  it(`agrees with the oracle (seed ${SEED})`, () => {
    const rand = rng(SEED);
    const pick = (): string => SEGMENTS[Math.floor(rand() * SEGMENTS.length)] ?? "";
    Array.from({ length: RUNS }).forEach(() => {
      const rel = Array.from({ length: Math.floor(rand() * 7) }, pick).join("/");
      const result = resolveRelativeSegments(rel);
      expect(result, rel).toBe(oracle(rel));
      if (result !== null) expect(result.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")).toBe(true);
    });
  });
});
