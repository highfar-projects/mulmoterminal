// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseStatusEntries, stateOf } from "../../../server/git/statusEntries";

const z = (...fields: string[]): string => fields.map((f) => `${f}\0`).join("");

// #2496. `git status --porcelain=v1 -z` as the Files tree's map, in every shape git prints it.
describe("stateOf", () => {
  it.each([
    [" M", "modified"],
    ["M ", "modified"],
    ["MM", "modified"],
    ["A ", "added"],
    ["AM", "added"],
    ["??", "untracked"],
    [" D", "deleted"],
    ["D ", "deleted"],
    ["R ", "renamed"],
    ["RM", "renamed"],
    ["UU", "modified"],
    ["AA", "modified"],
    ["DD", "modified"],
    ["DU", "modified"],
  ])("reads %j as %s", (xy, state) => {
    expect(stateOf(xy)).toBe(state);
  });
});

describe("parseStatusEntries", () => {
  it("maps each changed path from the repository root", () => {
    expect(parseStatusEntries(z(" M a.txt", "?? new.txt", "A  added.ts", " D gone.md"), "").files).toEqual({
      "a.txt": "modified",
      "new.txt": "untracked",
      "added.ts": "added",
      "gone.md": "deleted",
    });
  });

  // A rename or copy is followed by its ORIGINAL path, which is not an entry of its own.
  it("skips a rename's and a copy's original path", () => {
    expect(parseStatusEntries(z("R  docs/new.md", "docs/old.md", "C  copy.ts", "src.ts", " M after.txt"), "").files).toEqual({
      "docs/new.md": "renamed",
      "copy.ts": "modified",
      "after.txt": "modified",
    });
  });

  // An original path whose third character is a space looks like an entry's `XY path` — read as
  // one, it would invent a changed file named after the tail of the old name.
  it("does not read a rename's original path as an entry, whatever it looks like", () => {
    expect(parseStatusEntries(z("R  new.md", "ab c.md"), "").files).toEqual({ "new.md": "renamed" });
  });

  it("keys an untracked folder git reports whole by the folder's own path", () => {
    expect(parseStatusEntries(z("?? build/"), "").files).toEqual({ build: "untracked" });
  });

  // The pane's root may be a folder inside the repository: paths are made relative to it, and
  // anything outside it is left out.
  it("makes paths relative to the pane's root and drops the rest", () => {
    expect(parseStatusEntries(z(" M sub/a.txt", " M other/b.txt", "?? sub/newdir/", "?? sub/"), "sub/").files).toEqual({
      "a.txt": "modified",
      newdir: "untracked",
    });
  });

  it("keeps names as they are", () => {
    expect(parseStatusEntries(z("?? 日本語 メモ.md"), "").files).toEqual({ "日本語 メモ.md": "untracked" });
  });

  // Past the limit the walk stops and says so, rather than reading the rest of an answer nobody draws.
  it("stops at the limit and says the answer was cut short", () => {
    expect(parseStatusEntries(z(" M a", " M b", " M c"), "", 2)).toEqual({ files: {}, truncated: true });
    expect(parseStatusEntries(z(" M a", " M b"), "", 2)).toEqual({ files: { a: "modified", b: "modified" }, truncated: false });
  });

  // Entries outside the pane's root do not count against it.
  it("counts only what is under the pane's root", () => {
    expect(parseStatusEntries(z(" M out/a", " M out/b", " M sub/c"), "sub/", 1)).toEqual({ files: { c: "modified" }, truncated: false });
  });

  it.each([[""], ["\0"], ["garbage"], ["XY"], [" M"]])("reads %j as nothing", (stdout) => {
    expect(parseStatusEntries(stdout, "").files).toEqual({});
  });
});
