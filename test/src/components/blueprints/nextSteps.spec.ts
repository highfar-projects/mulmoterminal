import { describe, it, expect } from "vitest";
import { nextOptions, usecaseTitle } from "../../../../src/components/blueprints/nextSteps";
import type { PackList } from "../../../../src/composables/blueprintsApi";

type Step = { usecase: string; answers: Record<string, string>; carry?: Record<string, string> };
const usecase = (slug: string, bases: string[], next: Step[] = []) => ({
  slug,
  manifest: {
    kind: "usecase" as const,
    slug,
    title: `title of ${slug}`,
    version: "1",
    description: "",
    bases,
    next: next.map((step) => ({ carry: {}, ...step })),
  },
});
const base = (slug: string) => ({
  slug,
  manifest: { kind: "base" as const, slug, title: slug, version: "1", description: "", platform: slug, requires: [], credentials: [] },
});

const PACKS: PackList = [
  base("docs"),
  base("firebase"),
  usecase(
    "style",
    ["docs"],
    [
      { usecase: "write", answers: { style: "folder" } },
      { usecase: "polish", answers: {} },
      { usecase: "not-installed", answers: {} },
      { usecase: "internal", answers: {} },
      { usecase: "docs", answers: {} },
    ],
  ),
  usecase("write", ["docs"], [{ usecase: "polish", answers: { scope: "fixed" }, carry: { style: "style", targets: "documents", scope: "scope" } }]),
  usecase("polish", ["docs", "firebase"]),
  usecase("internal", ["firebase"]),
];

describe("nextOptions", () => {
  it("offers the named next steps that are installed and sit on the finished build's base, in order, with their answers", () => {
    expect(nextOptions(PACKS, { base: "docs", usecase: "style" })).toEqual([
      { usecase: "write", title: "title of write", answers: { style: "folder" } },
      { usecase: "polish", title: "title of polish", answers: {} },
    ]);
  });

  it("carries the finished build's own answers over, leaves out one it never gave, and lets a fixed answer win", () => {
    expect(nextOptions(PACKS, { base: "docs", usecase: "write" }, { style: "folder", scope: "mine", extra: "x" })).toEqual([
      { usecase: "polish", title: "title of polish", answers: { style: "folder", scope: "fixed" } },
    ]);
    expect(nextOptions(PACKS, { base: "docs", usecase: "write" })).toEqual([{ usecase: "polish", title: "title of polish", answers: { scope: "fixed" } }]);
  });

  it("offers nothing for a usecase with no next steps, one that is not installed, or a base named as the usecase", () => {
    expect(nextOptions(PACKS, { base: "docs", usecase: "polish" })).toEqual([]);
    expect(nextOptions(PACKS, { base: "docs", usecase: "gone" })).toEqual([]);
    expect(nextOptions(PACKS, { base: "docs", usecase: "docs" })).toEqual([]);
  });
});

describe("usecaseTitle", () => {
  it("is the installed usecase's title, and its slug when it is not installed", () => {
    expect(usecaseTitle(PACKS, "style")).toBe("title of style");
    expect(usecaseTitle(PACKS, "gone")).toBe("gone");
  });
});
