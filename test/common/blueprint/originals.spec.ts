// @vitest-environment node
import { describe, it, expect } from "vitest";
import { originalPaths, originalsViewSchema, proposedBase } from "../../../common/blueprint/originals";

describe("originalPaths", () => {
  it("compares each path once, in a stable order", () => {
    expect(originalPaths(["b.md", "docs/a.md", "b.md", "a.md"])).toEqual({ paths: ["a.md", "b.md", "docs/a.md"], more: false });
  });

  it("stops at the limit and says more are left", () => {
    expect(originalPaths(["c", "a", "b"], 2)).toEqual({ paths: ["a", "b"], more: true });
    expect(originalPaths(["a", "b"], 2)).toEqual({ paths: ["a", "b"], more: false });
  });

  it("has nothing to compare without originals", () => {
    expect(originalPaths([])).toEqual({ paths: [], more: false });
  });
});

describe("originalsViewSchema", () => {
  it("takes a file that is gone, and refuses an original that is not text", () => {
    expect(originalsViewSchema.safeParse({ files: [{ path: "a.md", original: "x", current: null }], more: false }).success).toBe(true);
    expect(originalsViewSchema.safeParse({ files: [{ path: "a.md", original: null, current: "x" }], more: false }).success).toBe(false);
  });
});

describe("proposedBase", () => {
  it.each([
    ["contract.proposed.txt", "contract.txt"],
    ["docs/a.proposed.md", "docs/a.md"],
    ["notes.proposed", "notes"],
    ["a.b.proposed.md", "a.b.md"],
    ["x.proposed.proposed.md", "x.proposed.md"],
  ])("finds the document %s was made from", (file, base) => {
    expect(proposedBase(file)).toBe(base);
  });

  it.each([
    "contract.txt",
    ".proposed.md",
    "docs/.proposed.md",
    "a.proposed.tar.gz",
    "a.proposed.",
    "a.proposedx.md",
    "proposed.md",
    ".env.proposed",
    "docs/.notes.proposed.md",
  ])("finds none for %s", (file) => {
    expect(proposedBase(file)).toBeNull();
  });
});
