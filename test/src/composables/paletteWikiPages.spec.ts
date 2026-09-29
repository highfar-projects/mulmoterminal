import { describe, it, expect } from "vitest";
import { paletteWikiPages } from "../../../src/composables/paletteWikiPages";

describe("paletteWikiPages", () => {
  it("keeps the title, and searches the slug, the description and the tags beside it", () => {
    expect(paletteWikiPages([{ slug: "deploy", title: "Deploy notes", description: "How we ship", tags: ["ops", "release"] }])).toEqual([
      { slug: "deploy", title: "Deploy notes", description: "How we ship", keywords: "deploy How we ship #ops #release" },
    ]);
  });

  it("names an untitled page by its slug, and leaves empty parts out of the keywords", () => {
    expect(paletteWikiPages([{ slug: "scratch", title: "", description: "", tags: [] }])).toEqual([
      { slug: "scratch", title: "scratch", description: "", keywords: "scratch" },
    ]);
  });

  it("lists a page the index names twice once, as its first entry", () => {
    const twice = paletteWikiPages([
      { slug: "deploy", title: "Deploy notes", description: "", tags: [] },
      { slug: "deploy", title: "Deploy (again)", description: "", tags: [] },
    ]);
    expect(twice.map((page) => page.title)).toEqual(["Deploy notes"]);
  });

  it("has no rows for an empty wiki", () => {
    expect(paletteWikiPages([])).toEqual([]);
  });
});
