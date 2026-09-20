import { describe, it, expect } from "vitest";
import { ancestorDirs, expandedPaths, restoreLevels, type TreeNode } from "../../../src/components/filesTreeState";

const dir = (path: string, expanded: boolean, children: TreeNode[] = []): TreeNode => ({ path, dir: true, expanded, children });
const file = (path: string): TreeNode => ({ path, dir: false, expanded: false, children: [] });

describe("expandedPaths", () => {
  it("collects open directories, parents before their children", () => {
    const tree = [dir("src", true, [dir("src/deep", true, [file("src/deep/a.ts")]), file("src/b.ts")]), dir("docs", false, []), file("README.md")];
    expect(expandedPaths(tree)).toEqual(["src", "src/deep"]);
  });

  it("ignores files and closed directories, and descends only into open ones", () => {
    const tree = [dir("closed", false, [dir("closed/inner", true, [])]), file("a.md")];
    expect(expandedPaths(tree)).toEqual([]);
  });

  it("has nothing to say about an empty tree", () => {
    expect(expandedPaths([])).toEqual([]);
  });
});

/** Pairs in one level where the first is an ancestor of the second — the thing that must never
 *  happen, since a child is looked up in the tree its parent's fetch creates. Named rather than
 *  inlined so the assertion above reads as the property, not as four nested callbacks. */
const ancestorsSharingALevel = (level: readonly string[]): string[] =>
  level.flatMap((path) => level.filter((other) => other !== path && path.startsWith(`${other}/`)).map((other) => `${other} with ${path}`));

describe("restoreLevels", () => {
  // Opening a directory fetches its children, so a child cannot be opened before its parent
  // has been — whatever order the remembered list happens to be in.
  it("puts shallower paths first", () => {
    expect(restoreLevels(["a/b/c", "a", "a/b"])).toEqual([["a"], ["a/b"], ["a/b/c"]]);
  });

  it("orders same-depth paths predictably, and drops duplicates", () => {
    expect(restoreLevels(["b", "a", "b"])).toEqual([["a", "b"]]);
  });

  it("is empty for nothing remembered", () => {
    expect(restoreLevels([])).toEqual([]);
  });

  // The point of grouping: siblings go in ONE level, so they are fetched together. A flat list
  // read them one at a time, which is the delay #2148 reported.
  it("puts every directory of the same depth in one level", () => {
    expect(restoreLevels(["src", "server", "test", "docs"])).toEqual([["docs", "server", "src", "test"]]);
  });

  // And the constraint the grouping must never break, over a shape no hand-written case covers:
  // a parent and a child can never share a level, or the child would be looked up before its
  // parent's children exist and simply be skipped.
  it("never puts a path in the same level as one of its own ancestors", () => {
    const paths = ["a", "a/b", "a/b/c", "a/b/d", "e", "e/f", "g", "a/x", "e/f/g/h"];
    expect(restoreLevels(paths).flatMap(ancestorsSharingALevel)).toEqual([]);
  });

  // Nothing may be dropped on the way into the levels: a directory that never gets fetched is a
  // directory that silently stops being remembered.
  it("keeps every distinct path exactly once across the levels", () => {
    const paths = ["a", "a/b", "e", "a", "e/f", "g"];
    expect(restoreLevels(paths).flat().sort()).toEqual([...new Set(paths)].sort());
  });
});

describe("ancestorDirs", () => {
  it("lists the directories to open, outermost first", () => {
    expect(ancestorDirs("a/b/c.ts")).toEqual(["a", "a/b"]);
  });

  it("has nothing to open for a file at the root", () => {
    expect(ancestorDirs("README.md")).toEqual([]);
  });

  it("ignores empty segments from a doubled or trailing separator", () => {
    expect(ancestorDirs("a//b/c.ts")).toEqual(["a", "a/b"]);
  });

  it("has nothing to say about an empty path", () => {
    expect(ancestorDirs("")).toEqual([]);
  });
});
