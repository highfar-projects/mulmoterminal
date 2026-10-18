import { describe, it, expect } from "vitest";
import { dirSuggestKeyAction, type DirSuggestKey } from "../../../src/components/dirSuggestKeys";

const KEYS: DirSuggestKey[] = ["ArrowUp", "ArrowDown", "Tab", "Enter", "Escape"];

describe("dirSuggestKeyAction", () => {
  it.each(KEYS)("leaves %s to the field when there is no list", (key) => {
    expect(dirSuggestKeyAction(key, -1, 0)).toEqual({ kind: "none" });
    expect(dirSuggestKeyAction(key, 2, 0)).toEqual({ kind: "none" });
  });

  it("moves down and wraps to the top", () => {
    expect(dirSuggestKeyAction("ArrowDown", -1, 3)).toEqual({ kind: "move", index: 0 });
    expect(dirSuggestKeyAction("ArrowDown", 1, 3)).toEqual({ kind: "move", index: 2 });
    expect(dirSuggestKeyAction("ArrowDown", 2, 3)).toEqual({ kind: "move", index: 0 });
  });

  it("moves up and wraps to the bottom, from no highlight too", () => {
    expect(dirSuggestKeyAction("ArrowUp", -1, 3)).toEqual({ kind: "move", index: 2 });
    expect(dirSuggestKeyAction("ArrowUp", 0, 3)).toEqual({ kind: "move", index: 2 });
    expect(dirSuggestKeyAction("ArrowUp", 2, 3)).toEqual({ kind: "move", index: 1 });
  });

  it("accepts the highlighted row on Tab, or the first when none is", () => {
    expect(dirSuggestKeyAction("Tab", 1, 3)).toEqual({ kind: "accept", index: 1 });
    expect(dirSuggestKeyAction("Tab", -1, 3)).toEqual({ kind: "accept", index: 0 });
  });

  it("accepts on Enter only when a row is highlighted, so a plain Enter still launches", () => {
    expect(dirSuggestKeyAction("Enter", 2, 3)).toEqual({ kind: "accept", index: 2 });
    expect(dirSuggestKeyAction("Enter", -1, 3)).toEqual({ kind: "none" });
  });

  it("closes on Escape", () => {
    expect(dirSuggestKeyAction("Escape", -1, 1)).toEqual({ kind: "close" });
  });
});
