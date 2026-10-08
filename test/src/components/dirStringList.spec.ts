import { describe, it, expect } from "vitest";
import { withEntryAdded, withEntryMoved, withEntryRemoved, withEntryReplaced } from "../../../src/components/dirStringList";

describe("a directory's string lists", () => {
  it("rewrites an entry, trimmed, and removes one emptied", () => {
    expect(withEntryReplaced(["a", "b"], 1, " c ")).toEqual(["a", "c"]);
    expect(withEntryReplaced(["a", "b"], 0, "  ")).toEqual(["b"]);
  });

  it("removes by position", () => {
    expect(withEntryRemoved(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("adds at the end, and adds nothing empty or already there", () => {
    expect(withEntryAdded(["a"], " b ")).toEqual(["a", "b"]);
    expect(withEntryAdded(["a"], "  ")).toBeNull();
    expect(withEntryAdded(["a"], "a")).toBeNull();
  });

  it("swaps an entry with its neighbour, and changes nothing at either end", () => {
    expect(withEntryMoved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(withEntryMoved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(withEntryMoved(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(withEntryMoved(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(withEntryMoved(["a"], 5, 1)).toEqual(["a"]);
  });
});
