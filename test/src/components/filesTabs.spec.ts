import { describe, it, expect } from "vitest";
import {
  EMPTY_STRIP,
  closed,
  neighbourOf,
  openedInFront,
  openedInNewTab,
  steppedPath,
  tabLabels,
  withTab,
  type TabStrip,
  isUnder,
  movedPath,
  renamedIn,
  withoutEntry,
} from "../../../src/components/filesTabs";
import { MAX_TABS } from "../../../src/components/filesPaneStore";

const strip = (paths: string[], activePath: string | null): TabStrip => ({ tabs: paths.map((path) => ({ path })), activePath });
const paths = (s: TabStrip): string[] => s.tabs.map((tab) => tab.path);

describe("filesTabs — a plain open (#2267)", () => {
  it("takes the front tab's place, as it took the one open file's", () => {
    const next = openedInFront(strip(["a", "b", "c"], "b"), "x");
    expect(paths(next)).toEqual(["a", "x", "c"]);
    expect(next.activePath).toBe("x");
  });

  it("goes to a tab that is already open instead of opening it twice", () => {
    const next = openedInFront(strip(["a", "b", "c"], "a"), "c");
    expect(paths(next)).toEqual(["a", "b", "c"]);
    expect(next.activePath).toBe("c");
  });

  it("opens the first tab in an empty strip", () => {
    expect(openedInFront(EMPTY_STRIP, "a")).toEqual(strip(["a"], "a"));
  });

  // After a front tab was dropped because its file had gone, tabs remain with none in front.
  it("adds a tab when none is in front rather than replacing one", () => {
    const next = openedInFront(strip(["a", "b"], null), "x");
    expect(paths(next)).toEqual(["a", "b", "x"]);
    expect(next.activePath).toBe("x");
  });

  it("forgets what the replaced tab remembered — a new file starts at its top", () => {
    const next = openedInFront({ tabs: [{ path: "a", caret: { line: 9, col: 1 }, showPreview: true }], activePath: "a" }, "x");
    expect(next.tabs).toEqual([{ path: "x" }]);
  });

  it("does not change the strip it was handed", () => {
    const before = strip(["a", "b"], "a");
    openedInFront(before, "x");
    expect(before).toEqual(strip(["a", "b"], "a"));
  });
});

describe("filesTabs — an open that asked for its own tab", () => {
  it("lands just after the front tab", () => {
    const next = openedInNewTab(strip(["a", "b", "c"], "a"), "x");
    expect(paths(next)).toEqual(["a", "x", "b", "c"]);
    expect(next.activePath).toBe("x");
  });

  it("lands at the end when no tab is in front", () => {
    expect(paths(openedInNewTab(strip(["a", "b"], null), "x"))).toEqual(["a", "b", "x"]);
    expect(openedInNewTab(EMPTY_STRIP, "x")).toEqual(strip(["x"], "x"));
  });

  it("goes to a tab that is already open, keeping what it remembered", () => {
    const before: TabStrip = { tabs: [{ path: "a" }, { path: "b", caret: { line: 4, col: 0 } }], activePath: "a" };
    const next = openedInNewTab(before, "b");
    expect(next.tabs).toEqual(before.tabs);
    expect(next.activePath).toBe("b");
  });

  it("replaces the front tab at the cap rather than dropping one the reader did not choose", () => {
    const full = strip(
      Array.from({ length: MAX_TABS }, (_, i) => `f${i}`),
      "f3",
    );
    const next = openedInNewTab(full, "x");
    expect(next.tabs).toHaveLength(MAX_TABS);
    expect(paths(next)[3]).toBe("x");
    expect(next.activePath).toBe("x");
  });

  it("still adds one just below the cap", () => {
    const almost = strip(
      Array.from({ length: MAX_TABS - 1 }, (_, i) => `f${i}`),
      "f0",
    );
    expect(openedInNewTab(almost, "x").tabs).toHaveLength(MAX_TABS);
  });
});

describe("filesTabs — closing", () => {
  it("hands the front to the right neighbour", () => {
    expect(closed(strip(["a", "b", "c"], "b"), "b")).toEqual(strip(["a", "c"], "c"));
  });

  it("hands it to the left one when the last tab closes", () => {
    expect(closed(strip(["a", "b", "c"], "c"), "c")).toEqual(strip(["a", "b"], "b"));
  });

  it("leaves no front when the only tab closes", () => {
    expect(closed(strip(["a"], "a"), "a")).toEqual(EMPTY_STRIP);
  });

  it("keeps the front where it is when another tab closes", () => {
    expect(closed(strip(["a", "b", "c"], "a"), "c")).toEqual(strip(["a", "b"], "a"));
  });

  it("changes nothing for a path that has no tab", () => {
    expect(closed(strip(["a", "b"], "a"), "zzz")).toEqual(strip(["a", "b"], "a"));
    expect(closed(EMPTY_STRIP, "a")).toEqual(EMPTY_STRIP);
  });

  it("names the neighbour, or none", () => {
    expect(neighbourOf(strip(["a", "b", "c"], "a"), "a")).toBe("b");
    expect(neighbourOf(strip(["a", "b", "c"], "a"), "c")).toBe("b");
    expect(neighbourOf(strip(["a"], "a"), "a")).toBeNull();
    expect(neighbourOf(strip(["a"], "a"), "zzz")).toBeNull();
    expect(neighbourOf(EMPTY_STRIP, "a")).toBeNull();
  });
});

describe("filesTabs — stepping between tabs", () => {
  it("moves to the next and previous tab", () => {
    expect(steppedPath(strip(["a", "b", "c"], "b"), 1)).toBe("c");
    expect(steppedPath(strip(["a", "b", "c"], "b"), -1)).toBe("a");
  });

  it("goes round at both ends", () => {
    expect(steppedPath(strip(["a", "b", "c"], "c"), 1)).toBe("a");
    expect(steppedPath(strip(["a", "b", "c"], "a"), -1)).toBe("c");
  });

  it("stays on a lone tab", () => {
    expect(steppedPath(strip(["a"], "a"), 1)).toBe("a");
    expect(steppedPath(strip(["a"], "a"), -1)).toBe("a");
  });

  it("starts from the first tab forward, and the last back, when none is in front", () => {
    expect(steppedPath(strip(["a", "b", "c"], null), 1)).toBe("a");
    expect(steppedPath(strip(["a", "b", "c"], null), -1)).toBe("c");
  });

  it("names nothing in an empty strip", () => {
    expect(steppedPath(EMPTY_STRIP, 1)).toBeNull();
    expect(steppedPath(EMPTY_STRIP, -1)).toBeNull();
  });
});

describe("filesTabs — recording a tab's place", () => {
  it("writes over the entry for the same path only", () => {
    const next = withTab(strip(["a", "b"], "a"), { path: "a", caret: { line: 3, col: 2 }, showPreview: true });
    expect(next.tabs).toEqual([{ path: "a", caret: { line: 3, col: 2 }, showPreview: true }, { path: "b" }]);
  });

  // Which files are open is decided by the open and close rules, never by a snapshot.
  it("does not add a tab for a path the strip does not hold", () => {
    expect(withTab(strip(["a"], "a"), { path: "x" })).toEqual(strip(["a"], "a"));
  });
});

describe("filesTabs — what each tab says", () => {
  it("names a file by its name", () => {
    expect(tabLabels(["src/app.ts", "README.md"])).toEqual(["app.ts", "README.md"]);
  });

  it("adds the parent where two open files share a name", () => {
    expect(tabLabels(["src/a/index.ts", "src/b/index.ts", "notes.md"])).toEqual(["a/index.ts", "b/index.ts", "notes.md"]);
  });

  it("keeps a top-level file's name as it is even when it is shared", () => {
    expect(tabLabels(["index.ts", "src/index.ts"])).toEqual(["index.ts", "src/index.ts"]);
  });

  it("answers an empty strip with no labels", () => {
    expect(tabLabels([])).toEqual([]);
  });
});

// #2578. A renamed entry keeps its tabs under the new name; a trashed one closes them.
describe("tabs after a rename or a Trash", () => {
  const strip = { tabs: [{ path: "a.md" }, { path: "src/x.ts" }, { path: "src/lib/y.ts" }, { path: "srcs/z.ts" }], activePath: "src/lib/y.ts" };

  it.each([
    ["the entry itself", "src/x.ts", "src/x.ts", "src/w.ts", "src/w.ts"],
    ["a path inside a renamed folder", "src/lib/y.ts", "src", "code", "code/lib/y.ts"],
    ["a path that only shares a prefix", "srcs/z.ts", "src", "code", "srcs/z.ts"],
    ["an unrelated path", "a.md", "src", "code", "a.md"],
  ])("moves %s", (_case, path, from, to, expected) => {
    expect(movedPath(path, from, to)).toBe(expected);
  });

  it("renames every tab under a folder, and the front with them", () => {
    expect(renamedIn(strip, "src", "code")).toEqual({
      tabs: [{ path: "a.md" }, { path: "code/x.ts" }, { path: "code/lib/y.ts" }, { path: "srcs/z.ts" }],
      activePath: "code/lib/y.ts",
    });
  });

  it("closes every tab on a trashed folder and hands the front on", () => {
    const after = withoutEntry(strip, "src");
    expect(after.tabs.map((tab) => tab.path)).toEqual(["a.md", "srcs/z.ts"]);
    expect(after.activePath).toBe("srcs/z.ts");
  });

  it("leaves the strip alone when nothing open was under it", () => {
    expect(withoutEntry(strip, "docs")).toEqual(strip);
    expect(isUnder("srcs/z.ts", "src")).toBe(false);
    expect(isUnder("src", "src")).toBe(true);
  });
});
