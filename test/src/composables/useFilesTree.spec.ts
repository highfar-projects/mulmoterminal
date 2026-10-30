import { describe, it, expect, beforeEach, vi } from "vitest";
import { adoptListing, findIn, flattenRows, useFilesTree, type TreeNode } from "../../../src/composables/useFilesTree";

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

  // A folder read again (#2578) keeps its children's paths under it, and what was open under it.
  it("reads a listing under a folder with paths under that folder", () => {
    const before = [dir("lib/src", [node("lib/src/inside.ts")])];
    const nested = adoptListing(before, entries, "lib");
    expect(nested.map((n) => n.path)).toEqual(["lib/src", "lib/a.ts"]);
    expect(nested[0]?.children.map((c) => c.path)).toEqual(["lib/src/inside.ts"]);
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

// The composable itself, driven without a pane — which is possible now, and is the cheapest way to
// reach the failure paths. `toggleDir`'s catch is the one Codex named as untested (#2169): a child
// listing that fails must leave the row CLOSED, because an open row with no children reads as an
// empty directory that is not.
describe("useFilesTree", () => {
  // A real Response rather than a shape asserted into one: `ok` then follows from the status the
  // way a browser's does, and nothing here needs a cast (Codex on #2174).
  const serve = (listings: Record<string, { name: string; dir: boolean; size: number }[] | null>) => {
    const calls: string[] = [];
    const answer: typeof fetch = async (input) => {
      const path = new URL(String(input), "https://x").searchParams.get("path") ?? "";
      calls.push(path);
      const entries = listings[path];
      if (!entries) return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
      return new Response(JSON.stringify({ entries }), { status: 200 });
    };
    globalThis.fetch = answer;
    return calls;
  };
  const paths = (tree: ReturnType<typeof useFilesTree>) => tree.rows.value.map((r) => r.node.path);
  /** The node at `target`, or a failure that NAMES it. A cast here would report the miss as
   *  "cannot read properties of null" several lines later (Codex on #2174). */
  const nodeAt = (tree: ReturnType<typeof useFilesTree>, target: string): TreeNode => {
    const found = tree.findNode(target);
    if (!found) throw new Error(`no node at ${target}`);
    return found;
  };
  const root = [
    { name: "src", dir: true, size: 0 },
    { name: "a.ts", dir: false, size: 1 },
  ];

  beforeEach(() => localStorage.clear());

  it("opens a directory and shows its children", async () => {
    serve({ "": root, src: [{ name: "inside.ts", dir: false, size: 1 }] });
    const tree = useFilesTree(() => "/proj");
    await tree.loadRoot();
    await tree.toggleDir(nodeAt(tree, "src"));
    expect(paths(tree)).toEqual(["src", "src/inside.ts", "a.ts"]);
  });

  it("leaves the row closed when its listing fails", async () => {
    serve({ "": root, src: null });
    const tree = useFilesTree(() => "/proj");
    await tree.loadRoot();
    const dir = nodeAt(tree, "src");
    await tree.toggleDir(dir);

    expect(dir.expanded).toBe(false); // not half-open over nothing
    expect(dir.loaded).toBe(false); // and it will be asked again
    expect(paths(tree)).toEqual(["src", "a.ts"]);
    expect(tree.error.value).toBeNull(); // one directory failing is not the TREE failing
  });

  // A directory that IS empty answers `{ entries: [] }`, which is not the same as a listing that
  // could not be read — the row stays open over nothing and is not asked for again. Carried from
  // #2169, where the failure case landed and this one did not.
  it("keeps an empty directory open and does not ask again", async () => {
    const calls = serve({ "": root, src: [] });
    const tree = useFilesTree(() => "/proj");
    await tree.loadRoot();
    const dir = nodeAt(tree, "src");
    await tree.toggleDir(dir);

    expect(dir.expanded).toBe(true);
    expect(dir.loaded).toBe(true);
    expect(paths(tree)).toEqual(["src", "a.ts"]);

    await tree.toggleDir(dir); // closed
    await tree.toggleDir(dir); // and open again
    expect(calls.filter((c) => c === "src")).toHaveLength(1);
  });

  it("asks again the next time that row is clicked", async () => {
    const calls = serve({ "": root, src: null });
    const tree = useFilesTree(() => "/proj");
    await tree.loadRoot();
    const dir = nodeAt(tree, "src");
    await tree.toggleDir(dir);
    await tree.toggleDir(dir);

    expect(calls.filter((c) => c === "src")).toHaveLength(2);
  });

  it("closes an open directory without asking again", async () => {
    const calls = serve({ "": root, src: [{ name: "inside.ts", dir: false, size: 1 }] });
    const tree = useFilesTree(() => "/proj");
    await tree.loadRoot();
    const dir = nodeAt(tree, "src");
    await tree.toggleDir(dir);
    await tree.toggleDir(dir);

    expect(paths(tree)).toEqual(["src", "a.ts"]);
    expect(calls.filter((c) => c === "src")).toHaveLength(1);
  });

  // #3215: the Reload button read the root only, and `adoptListing` carried every directory already
  // read, so a file added to an expanded folder from outside never showed.
  describe("refreshAll", () => {
    type Listing = { name: string; dir: boolean; size: number }[] | null;
    const file = (name: string) => ({ name, dir: false, size: 1 });
    const folder = (name: string) => ({ name, dir: true, size: 0 });
    /** A tree with `src` open and `plans` read once and collapsed, over a disk the test then changes. */
    const opened = async (disk: Record<string, Listing>) => {
      const calls = serve(disk);
      const tree = useFilesTree(() => "/proj");
      await tree.loadRoot();
      await tree.toggleDir(nodeAt(tree, "src"));
      await tree.toggleDir(nodeAt(tree, "plans"));
      await tree.toggleDir(nodeAt(tree, "plans"));
      calls.length = 0;
      return { tree, calls };
    };

    it("reads the root and every directory already read, open or collapsed, and not one never opened", async () => {
      const disk: Record<string, Listing> = {
        "": [folder("src"), folder("plans"), folder("docs")],
        src: [file("a.ts")],
        plans: [file("p.md")],
        docs: [file("d.md")],
      };
      const { tree, calls } = await opened(disk);
      disk.src = [file("a.ts"), file("b.ts")];
      disk.plans = [file("p.md"), file("zzz.md")];
      disk.docs = [file("d.md"), file("never.md")];

      await tree.refreshAll();

      expect(paths(tree)).toEqual(["src", "src/a.ts", "src/b.ts", "plans", "docs"]);
      const plans = nodeAt(tree, "plans");
      expect(plans.expanded).toBe(false);
      expect(plans.children.map((child) => child.path)).toEqual(["plans/p.md", "plans/zzz.md"]);
      expect(calls).toEqual(["", "src", "plans"]);
    });

    it("reads a directory nested under one it just re-read, found in the parent's fresh listing", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [folder("lib")], "src/lib": [file("x.ts")], plans: [] };
      const { tree, calls } = await opened(disk);
      await tree.toggleDir(nodeAt(tree, "src/lib"));
      calls.length = 0;
      disk["src/lib"] = [file("x.ts"), file("y.ts")];

      await tree.refreshAll();

      expect(paths(tree)).toEqual(["src", "src/lib", "src/lib/x.ts", "src/lib/y.ts", "plans"]);
      expect(calls).toEqual(["", "src", "src/lib", "plans"]);
    });

    it("drops a directory gone from the disk and does not ask for it", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [file("a.ts")], plans: [file("p.md")] };
      const { tree, calls } = await opened(disk);
      disk[""] = [folder("src")];
      disk.plans = null;

      await tree.refreshAll();

      expect(paths(tree)).toEqual(["src", "src/a.ts"]);
      expect(calls).toEqual(["", "src"]);
    });

    it("keeps the tree and asks nothing more when the root cannot be read", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [file("a.ts")], plans: [file("p.md")] };
      const { tree, calls } = await opened(disk);
      disk[""] = null;

      await tree.refreshAll();

      expect(tree.error.value).not.toBeNull();
      expect(paths(tree)).toEqual(["src", "src/a.ts", "plans"]);
      expect(calls).toEqual([""]);
    });

    it("keeps one directory's listing when only that directory cannot be read", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [file("a.ts")], plans: [file("p.md")] };
      const { tree } = await opened(disk);
      disk.src = null;
      disk.plans = [file("p.md"), file("zzz.md")];

      await tree.refreshAll();

      expect(tree.error.value).toBeNull();
      expect(paths(tree)).toEqual(["src", "src/a.ts", "plans"]);
      expect(nodeAt(tree, "plans").children.map((child) => child.path)).toEqual(["plans/p.md", "plans/zzz.md"]);
    });

    it("stops when the pane moves to another root while it is reading", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [file("a.ts")], plans: [file("p.md")] };
      const { tree, calls } = await opened(disk);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const plain = globalThis.fetch;
      // The request is recorded at once; its answer is held until the test lets it through.
      globalThis.fetch = async (input, init) => {
        const response = await plain(input, init);
        if (new URL(String(input), "https://x").searchParams.get("path") === "src") await gate;
        return response;
      };

      const reloading = tree.refreshAll();
      await vi.waitFor(() => expect(calls).toContain("src"));
      tree.reset();
      release();
      await reloading;

      expect(tree.roots.value).toBeNull();
      expect(calls).toEqual(["", "src"]);
    });

    // CodeRabbit on #3228: the generation has to be taken before the root read is awaited, or a
    // reload whose root was still pending when the pane moved resumes against the NEW root's tree.
    it("does not read the new root's folders when the move happened during its root read", async () => {
      const disk: Record<string, Listing> = { "": [folder("src"), folder("plans")], src: [file("a.ts")], plans: [file("p.md")] };
      const { tree, calls } = await opened(disk);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const plain = globalThis.fetch;
      let rootReads = 0;
      // Only the FIRST root read is held: the one the stale reload is waiting on.
      globalThis.fetch = async (input, init) => {
        const response = await plain(input, init);
        if (new URL(String(input), "https://x").searchParams.get("path") === "" && ++rootReads === 1) await gate;
        return response;
      };

      const reloading = tree.refreshAll();
      await vi.waitFor(() => expect(calls).toEqual([""]));
      tree.reset();
      await tree.loadRoot();
      await tree.toggleDir(nodeAt(tree, "src"));
      release();
      await reloading;

      expect(calls).toEqual(["", "", "src"]); // the stale reload read nothing after the move
      expect(paths(tree)).toEqual(["src", "src/a.ts", "plans"]);
    });
  });
});
