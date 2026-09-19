import { describe, it, expect } from "vitest";
import { adoptListing, findIn, flattenRows, type TreeNode } from "../../../src/composables/useFilesTree";

// The three decisions the tree makes about NODES, now that they are reachable without mounting a
// pane (#2158). They are what survived the differential harness that proved the lift: the shapes it
// generated (a nested tree, a collapsed one, a directory the user had opened) and the properties it
// compared (which rows are visible and at what depth, and what a fresh listing keeps).
const node = (path: string, over: Partial<TreeNode> = {}): TreeNode => ({
  name: path.split("/").pop() ?? path,
  path,
  dir: false,
  size: 1,
  expanded: false,
  loaded: false,
  children: [],
  ...over,
});
const dir = (path: string, children: TreeNode[], over: Partial<TreeNode> = {}): TreeNode =>
  node(path, { dir: true, loaded: true, expanded: true, children, ...over });

describe("flattenRows", () => {
  it("is empty for an empty forest", () => {
    expect(flattenRows([])).toEqual([]);
  });

  it("descends only into directories that are OPEN", () => {
    const tree = [dir("src", [node("src/a.ts"), dir("src/deep", [node("src/deep/b.ts")], { expanded: false })]), node("c.ts")];
    expect(flattenRows(tree).map((r) => `${r.node.path}@${r.depth}`)).toEqual(["src@0", "src/a.ts@1", "src/deep@1", "c.ts@0"]);
  });

  it("descends further when the inner one is open too", () => {
    const tree = [dir("src", [dir("src/deep", [node("src/deep/b.ts")])])];
    expect(flattenRows(tree).map((r) => `${r.node.path}@${r.depth}`)).toEqual(["src@0", "src/deep@1", "src/deep/b.ts@2"]);
  });

  // A file cannot have children, and an expanded FILE is a state the pane can reach by mistake —
  // the row is a button, and `toggleDir` is what decides. Descending on `expanded` alone would
  // render whatever was left in `children`.
  it("does not descend into a non-directory, whatever its flags say", () => {
    const odd = node("weird.ts", { expanded: true, loaded: true, children: [node("weird.ts/ghost")] });
    expect(flattenRows([odd]).map((r) => r.node.path)).toEqual(["weird.ts"]);
  });
});

describe("findIn", () => {
  const tree = [dir("src", [dir("src/deep", [node("src/deep/b.ts")])]), node("c.ts")];

  it.each([
    ["a root", "c.ts"],
    ["a directory", "src/deep"],
    ["a leaf two levels down", "src/deep/b.ts"],
  ])("finds %s", (_case, path) => {
    expect(findIn(tree, path)?.path).toBe(path);
  });

  // It looks inside COLLAPSED directories too: `restore` expands remembered paths parents-first,
  // so every node it asks for is one nobody has opened yet.
  it("finds a node inside a collapsed directory", () => {
    const collapsed = [dir("src", [node("src/a.ts")], { expanded: false })];
    expect(findIn(collapsed, "src/a.ts")?.path).toBe("src/a.ts");
  });

  it.each([
    ["a path that is not there", "nope.ts"],
    ["a prefix of a real path", "src/de"],
    ["the empty path", ""],
  ])("returns null for %s", (_case, path) => {
    expect(findIn(tree, path)).toBeNull();
  });
});

describe("adoptListing", () => {
  const entries = [
    { name: "src", dir: true, size: 0 },
    { name: "a.ts", dir: false, size: 1 },
  ];

  it("turns a listing into rows of the root", () => {
    expect(adoptListing(null, entries).map((n) => `${n.path}:${n.dir}`)).toEqual(["src:true", "a.ts:false"]);
  });

  it("starts every node closed and unread when there is nothing to carry", () => {
    const [srcNode] = adoptListing(null, entries);
    expect({ expanded: srcNode.expanded, loaded: srcNode.loaded, children: srcNode.children }).toEqual({ expanded: false, loaded: false, children: [] });
  });

  // The window the cache exists to fill is also a window the user can click in.
  it("carries a directory the user opened while the listing was in flight", () => {
    const before = [dir("src", [node("src/inside.ts")])];
    const [srcNode] = adoptListing(before, entries);
    expect({ expanded: srcNode.expanded, loaded: srcNode.loaded, children: srcNode.children.map((c) => c.path) }).toEqual({
      expanded: true,
      loaded: true,
      children: ["src/inside.ts"],
    });
  });

  it.each([
    ["it was never read", [dir("src", [node("src/inside.ts")], { loaded: false })]],
    ["the path is a FILE now", [dir("src", [node("src/inside.ts")])], [{ name: "src", dir: false, size: 9 }]],
    ["the path is gone from the listing", [dir("gone", [node("gone/x.ts")])]],
  ])("carries nothing when %s", (_case, before, listing = entries) => {
    const carried = adoptListing(before as TreeNode[], listing).find((n) => n.loaded);
    expect(carried).toBeUndefined();
  });
});
