import { describe, it, expect } from "vitest";
import { filesRowActions, menuFocusMove } from "../../../src/components/filesRowActions";

// What a tree row offers when it is right-clicked (#1859). Every rule here is about a path
// meaning something DIFFERENT at the other end than it does in the tree, which is why it is a
// pure function rather than an assertion about a menu.

const ids = (...args: Parameters<typeof filesRowActions>) => filesRowActions(...args).map((a) => a.id);
const textOf = (id: string, ...args: Parameters<typeof filesRowActions>) => filesRowActions(...args).find((a) => a.id === id)?.text;

describe("filesRowActions", () => {
  const here = { pathRel: "src/index.ts", cwd: "/proj", terminal: { cwd: "/proj" } };

  it("offers both paths when the tree and the terminal are the same directory", () => {
    expect(ids(here)).toEqual(["insert-relative", "insert-absolute"]);
    expect(textOf("insert-relative", here)).toBe("src/index.ts ");
    expect(textOf("insert-absolute", here)).toBe("/proj/src/index.ts ");
  });

  // The pane keeps the cell it is on when a re-root could not be saved out of, so the tree and
  // the terminal on screen can be two different projects. `src/index.ts` would then name a file
  // in the wrong one — and it would exist, which is what makes this worth withholding.
  it("withholds the relative path when the terminal is in another directory", () => {
    const elsewhere = { ...here, terminal: { cwd: "/other" } };
    expect(ids(elsewhere)).toEqual(["insert-absolute"]);
    expect(textOf("insert-absolute", elsewhere)).toBe("/proj/src/index.ts ");
  });

  it("offers nothing where there is no terminal to insert into", () => {
    expect(ids({ ...here, terminal: null })).toEqual([]);
  });

  // Both are unreachable from the grid, which always has a root — but the pane takes `cwd: null`
  // in its type and the overlay mounts it that way, so neither may produce a path.
  it("offers nothing without a root, and nothing for an empty path", () => {
    expect(ids({ ...here, cwd: null })).toEqual([]);
    expect(ids({ ...here, pathRel: "" })).toEqual([]);
    expect(ids({ pathRel: "", cwd: null, terminal: null })).toEqual([]);
  });

  // A directory is a path like any other, and gets no trailing slash: what the agent is being
  // handed is a name, and the tools it passes it to take it either way.
  it("treats a directory row as a plain path", () => {
    expect(textOf("insert-relative", { ...here, pathRel: "src" })).toBe("src ");
    expect(textOf("insert-absolute", { ...here, pathRel: "src" })).toBe("/proj/src ");
  });

  // toInsertText's rules, pinned here because this is where they reach a terminal: quoted when
  // the path is not shell-safe, and always ending in a space so a second insert is not glued on.
  it("quotes a path a shell would otherwise split, and keeps the trailing separator", () => {
    const spaced = { ...here, pathRel: "my docs/a b.md" };
    expect(textOf("insert-relative", spaced)).toBe("'my docs/a b.md' ");
    expect(textOf("insert-absolute", spaced)).toBe("'/proj/my docs/a b.md' ");
  });

  it("joins a Windows root the way absoluteUnder does, and quotes the result", () => {
    const win = { pathRel: "docs/x.md", cwd: "C:\\Users\\me", terminal: { cwd: "C:\\Users\\me" } };
    expect(textOf("insert-absolute", win)).toBe("'C:\\Users\\me/docs/x.md' ");
  });

  it("does not double a separator the root already ends with", () => {
    expect(textOf("insert-absolute", { ...here, cwd: "/proj/", terminal: { cwd: "/proj/" } })).toBe("/proj/src/index.ts ");
  });
});

describe("menuFocusMove", () => {
  it("wraps both ways round a two-item menu", () => {
    expect(menuFocusMove("ArrowDown", 0, 2)).toBe(1);
    expect(menuFocusMove("ArrowDown", 1, 2)).toBe(0);
    expect(menuFocusMove("ArrowUp", 1, 2)).toBe(0);
    expect(menuFocusMove("ArrowUp", 0, 2)).toBe(1);
  });

  it("answers the two ends when focus is not on an item yet", () => {
    expect(menuFocusMove("ArrowDown", -1, 3)).toBe(0);
    expect(menuFocusMove("ArrowUp", -1, 3)).toBe(2);
  });

  it("jumps to either end", () => {
    expect(menuFocusMove("Home", 2, 3)).toBe(0);
    expect(menuFocusMove("End", 0, 3)).toBe(2);
  });

  it("leaves every other key, and an empty menu, alone", () => {
    expect(menuFocusMove("Enter", 0, 2)).toBeNull();
    expect(menuFocusMove("a", 0, 2)).toBeNull();
    expect(menuFocusMove("ArrowDown", 0, 0)).toBeNull();
    expect(menuFocusMove("Home", -1, 0)).toBeNull();
  });

  it("stays put in a one-item menu", () => {
    expect(menuFocusMove("ArrowDown", 0, 1)).toBe(0);
    expect(menuFocusMove("ArrowUp", 0, 1)).toBe(0);
  });
});
