import { describe, it, expect } from "vitest";
import { clampTreeWidth, clippedNameTip, storedTreeWidth, treeWidthForKey, TREE_WIDTH_DEFAULT_PX } from "../../../src/components/fileTreeWidth";
import { MIN_FILE_EDITOR, MIN_FILE_TREE, SPLITTER_STEP } from "../../../src/components/splitterWidth";

const ROOMY = 1000;

describe("storedTreeWidth", () => {
  it("keeps a stored positive width", () => {
    expect(storedTreeWidth("300")).toBe(300);
  });

  it.each([null, "", "abc", "0", "-40", "Infinity", "NaN"])("falls back to the default for %j", (raw) => {
    expect(storedTreeWidth(raw)).toBe(TREE_WIDTH_DEFAULT_PX);
  });
});

describe("clampTreeWidth", () => {
  it("leaves a width that fits alone", () => {
    expect(clampTreeWidth(300, ROOMY)).toBe(300);
  });

  it("holds the tree at its floor", () => {
    expect(clampTreeWidth(10, ROOMY)).toBe(MIN_FILE_TREE);
  });

  it("never takes the editor below its floor", () => {
    expect(clampTreeWidth(ROOMY, ROOMY)).toBe(ROOMY - MIN_FILE_EDITOR);
  });

  it("gives the tree up first when both floors do not fit", () => {
    expect(clampTreeWidth(MIN_FILE_TREE, MIN_FILE_EDITOR + 10)).toBe(10);
  });

  it("is never negative, even in less space than the editor's floor", () => {
    expect(clampTreeWidth(MIN_FILE_TREE, MIN_FILE_EDITOR - 50)).toBe(0);
  });
});

// The tree is BEFORE the separator: the key has to move it the same way the pointer does.
describe("treeWidthForKey", () => {
  it("narrows the tree on ArrowLeft and widens it on ArrowRight", () => {
    expect(treeWidthForKey("ArrowLeft", 300, ROOMY)).toBe(300 - SPLITTER_STEP);
    expect(treeWidthForKey("ArrowRight", 300, ROOMY)).toBe(300 + SPLITTER_STEP);
  });

  it("sends Home to the tree's floor and End to the editor's", () => {
    expect(treeWidthForKey("Home", 300, ROOMY)).toBe(MIN_FILE_TREE);
    expect(treeWidthForKey("End", 300, ROOMY)).toBe(ROOMY - MIN_FILE_EDITOR);
  });

  it("stops at the floors", () => {
    expect(treeWidthForKey("ArrowLeft", MIN_FILE_TREE, ROOMY)).toBe(MIN_FILE_TREE);
    expect(treeWidthForKey("ArrowRight", ROOMY - MIN_FILE_EDITOR, ROOMY)).toBe(ROOMY - MIN_FILE_EDITOR);
  });

  it("ignores keys that are not the separator's", () => {
    ["Tab", "Escape", "ArrowUp", "ArrowDown", "Enter", "a"].forEach((key) => expect(treeWidthForKey(key, 300, ROOMY)).toBeNull());
  });
});

describe("clippedNameTip", () => {
  it("names the file when the label is cut off", () => {
    expect(clippedNameTip({ scrollWidth: 200, clientWidth: 120 }, "2026-08-long-name.log")).toBe("2026-08-long-name.log");
  });

  it("gives no tip when the whole name fits, exactly or with room", () => {
    expect(clippedNameTip({ scrollWidth: 120, clientWidth: 120 }, "a.txt")).toBeNull();
    expect(clippedNameTip({ scrollWidth: 40, clientWidth: 120 }, "a.txt")).toBeNull();
  });

  it("gives no tip without a label", () => {
    expect(clippedNameTip(null, "a.txt")).toBeNull();
  });
});
