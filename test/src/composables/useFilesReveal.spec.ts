import { describe, it, expect } from "vitest";
import { ref, shallowRef, type ShallowRef } from "vue";
import { rowElementFor, useFilesReveal, type FilesRevealDeps } from "../../../src/composables/useFilesReveal";
import type { FilesTree, TreeNode } from "../../../src/composables/useFilesTree";

// The reveal, driven without a pane (#2158). What survived the differential harness that proved the
// lift: its generator (a pick that beats the tree, two picks racing, a re-root mid-flight, a file
// that will not open) and its property (which reveal is allowed to finish, and what it says).
//
// The pane's own finder spec covers the same ground through the markup and keeps doing so. This is
// the half that is awkward there: a row whose path holds a quote, and a reveal asked to report on
// a file the editor never reached.

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

/** A tree that answers from a flat map, and records which directories were asked to open. */
function fakeTree(dirs: string[], opened: string[], hold?: Promise<void>): FilesTree {
  const nodes = new Map(dirs.map((path) => [path, node(path, { dir: true })]));
  return {
    roots: ref(null),
    error: ref(null),
    rows: ref([]) as unknown as FilesTree["rows"],
    loadRoot: async () => {},
    toggleDir: async (n: TreeNode) => {
      opened.push(n.path);
      if (hold) await hold;
      n.expanded = true;
    },
    findNode: (target: string) => nodes.get(target) ?? null,
    reset: () => {},
  };
}

interface Harness {
  reveal: ReturnType<typeof useFilesReveal>;
  opened: string[];
  reads: string[];
  /** Which rows were scrolled to, in order — the only way to see that a losing reveal stopped. */
  scrolled: string[];
  openPath: FilesRevealDeps["openPath"];
  treeEl: ShallowRef<HTMLElement | null>;
}

/** A rendered tree, so scrolling is observable. jsdom has no layout and no `scrollIntoView`, so
 *  each row is given one that records itself. */
function rowsHost(paths: string[], scrolled: string[]): HTMLElement {
  const host = document.createElement("div");
  paths.forEach((path) => {
    const row = document.createElement("div");
    row.dataset.path = path;
    row.scrollIntoView = () => scrolled.push(path);
    host.appendChild(row);
  });
  return host;
}

function harness(over: Partial<{ startup: Promise<void>; holdDir: Promise<void>; holdFirstOpen: Promise<void>; opens: boolean }> = {}): Harness {
  const opened: string[] = [];
  const reads: string[] = [];
  const scrolled: string[] = [];
  const openPath = ref<string | null>(null);
  const treeEl = shallowRef<HTMLElement | null>(rowsHost(["src/deep/buried.ts", "README.md"], scrolled));
  const reveal = useFilesReveal({
    tree: fakeTree(["src", "src/deep"], opened, over.holdDir),
    treeEl,
    started: () => over.startup ?? Promise.resolve(),
    open: async (pathRel) => {
      reads.push(pathRel);
      if (reads.length === 1 && over.holdFirstOpen) await over.holdFirstOpen;
      if (over.opens !== false) openPath.value = pathRel;
    },
    openPath,
  });
  return { reveal, opened, reads, scrolled, openPath, treeEl };
}

describe("useFilesReveal", () => {
  it("expands the ancestors outermost first, then opens the file", async () => {
    const h = harness();
    expect(await h.reveal.revealPath("src/deep/buried.ts")).toBe(true);
    expect(h.opened).toEqual(["src", "src/deep"]);
    expect(h.reads).toEqual(["src/deep/buried.ts"]);
  });

  it("opens a root file without expanding anything", async () => {
    const h = harness();
    await h.reveal.revealPath("README.md");
    expect(h.opened).toEqual([]);
    expect(h.reads).toEqual(["README.md"]);
  });

  // The `files-find` shortcut mounts the pane and opens the finder over it in the same breath, so
  // a pick can land while the tree is still being read. Expanding into an unread forest finds no
  // ancestor at all — the file opens and the tree stays collapsed, which is the half of #2099 the
  // issue actually asked for.
  it("waits for the startup before it goes looking for ancestors", async () => {
    let release = (): void => {};
    const startup = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ startup });

    const pending = h.reveal.revealPath("src/deep/buried.ts");
    await Promise.resolve();
    expect(h.opened).toEqual([]); // nothing yet — the tree does not exist

    release();
    expect(await pending).toBe(true);
    expect(h.opened).toEqual(["src", "src/deep"]);
  });

  // The same overtaking, one await earlier: BOTH picks are parked in the startup, because the
  // `files-find` shortcut can open the panel over a pane whose tree is still being read. The first
  // one resumes first and must find that it has already lost.
  it("drops a reveal that was still waiting for the startup when a later one arrived", async () => {
    let release = (): void => {};
    const startup = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ startup });

    const first = h.reveal.revealPath("src/deep/buried.ts");
    const second = h.reveal.revealPath("README.md");
    release();

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(h.reads).toEqual(["README.md"]); // the loser never opened its file
    expect(h.opened).toEqual([]); // nor expanded anything on the way
  });

  // And one await LATER: the file was read, and the pick changed while it was being read. The tree
  // now belongs to the other file, so scrolling to this one would move the reader off it.
  it("does not scroll to its row when a later pick took over while its file was opening", async () => {
    let release = (): void => {};
    const holdFirstOpen = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ holdFirstOpen });

    const first = h.reveal.revealPath("README.md"); // no ancestors — it parks inside the open
    await Promise.resolve();
    const second = h.reveal.revealPath("src/deep/buried.ts");
    release();

    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(h.scrolled).toEqual(["src/deep/buried.ts"]); // only the winner moved the tree
  });

  it("scrolls to the row it revealed", async () => {
    const h = harness();
    await h.reveal.revealPath("src/deep/buried.ts");
    expect(h.scrolled).toEqual(["src/deep/buried.ts"]);
  });

  // A reveal spends most of its time fetching, so a second pick can overtake the first. The loser
  // landing second would replace the file the user chose with the one they abandoned.
  it("lets the later pick win, and the earlier one reports that it lost", async () => {
    let release = (): void => {};
    const holdDir = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ holdDir });

    const first = h.reveal.revealPath("src/deep/buried.ts"); // parks inside the first expansion
    await Promise.resolve();
    const second = h.reveal.revealPath("README.md"); // no ancestors, so it finishes first

    expect(await second).toBe(true);
    release();
    expect(await first).toBe(false);
    expect(h.reads).toEqual(["README.md"]); // the abandoned reveal never opened its file
  });

  // The pane re-roots in place. A reveal still expanding would otherwise scroll the NEW project's
  // tree to a row from the one it just left.
  it("abandons a reveal the pane reset out from under it", async () => {
    let release = (): void => {};
    const holdDir = new Promise<void>((resolve) => (release = resolve));
    const h = harness({ holdDir });

    const pending = h.reveal.revealPath("src/deep/buried.ts");
    await Promise.resolve();
    h.reveal.reset();
    release();

    expect(await pending).toBe(false);
    expect(h.reads).toEqual([]);
  });

  // `open` has several ways to end without opening anything — the file is gone, the read failed,
  // or it declined to leave a dirty buffer. A caller that goes on to scroll to a line number has
  // to know, or it scrolls an unrelated file to an arbitrary place while looking deliberate.
  it("says so when the editor did not end up on the file", async () => {
    const h = harness({ opens: false });
    expect(await h.reveal.revealPath("src/deep/buried.ts")).toBe(false);
    expect(h.reads).toEqual(["src/deep/buried.ts"]); // it did try
  });

  describe("the finder panel", () => {
    it("closes as the pick begins, so the tree it scrolls is visible", async () => {
      const h = harness();
      h.reveal.finderOpen.value = true;
      h.reveal.onFinderPick("README.md");
      expect(h.reveal.finderOpen.value).toBe(false);
      await Promise.resolve();
    });

    it("is closed by a reset, so a re-rooted pane does not offer the old project's paths", () => {
      const h = harness();
      h.reveal.finderOpen.value = true;
      h.reveal.reset();
      expect(h.reveal.finderOpen.value).toBe(false);
    });
  });
});

// The reason this walks the rows instead of building a selector. A path is a filename, and a
// filename may hold a quote or a backslash — `[data-path="a"b"]` is not a selector, it is a
// SyntaxError, and the reveal would die on the one file whose name caused it.
describe("rowElementFor", () => {
  const treeWith = (...paths: string[]): HTMLElement => {
    const host = document.createElement("div");
    paths.forEach((path) => {
      const row = document.createElement("div");
      row.dataset.path = path;
      host.appendChild(row);
    });
    return host;
  };

  it("finds an ordinary path", () => {
    expect(rowElementFor(treeWith("src/a.ts", "b.ts"), "b.ts")?.dataset.path).toBe("b.ts");
  });

  it.each([['say "hi".md'], ["back\\slash.ts"], ["bracket[1].ts"], ["it's here.ts"], ["a:b.ts"]])("finds a path spelled %s", (path) => {
    expect(rowElementFor(treeWith("plain.ts", path), path)?.dataset.path).toBe(path);
  });

  it("is undefined for a path that has no row", () => {
    expect(rowElementFor(treeWith("a.ts"), "b.ts")).toBeUndefined();
  });

  it("is undefined when the tree has not rendered", () => {
    expect(rowElementFor(null, "a.ts")).toBeUndefined();
  });

  // A prefix is not a match: `src` and `src/a.ts` are different rows and revealing one must not
  // scroll to the other.
  it("does not match a path by prefix", () => {
    expect(rowElementFor(treeWith("src/a.ts"), "src")).toBeUndefined();
  });
});
