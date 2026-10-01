import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SearchContextLines from "../../../src/components/SearchContextLines.vue";

// The lines drawn above and below the selected search match. They are decoration for a sighted reader
// — the match line itself is the option — so the block is hidden from assistive technology.

describe("SearchContextLines", () => {
  const lines = [
    { line: 7, text: "first", clipped: false },
    { line: 8, text: "second", clipped: true },
  ];

  it("draws each line with its number, and marks a clipped one", () => {
    const w = mount(SearchContextLines, { props: { lines } });
    const rows = w.findAll(":scope > div");
    expect(rows.map((row) => row.findAll("span").map((span) => span.text()))).toEqual([
      ["7", "first"],
      ["8", "second …", "…"],
    ]);
  });

  it("is hidden from assistive technology and takes the caller's test id on its root", () => {
    const w = mount(SearchContextLines, { props: { lines }, attrs: { "data-testid": "file-search-context-after" } });
    expect(w.attributes("aria-hidden")).toBe("true");
    expect(w.attributes("data-testid")).toBe("file-search-context-after");
  });

  it("renders an empty block for no lines", () => {
    const w = mount(SearchContextLines, { props: { lines: [] } });
    expect(w.element.children).toHaveLength(0);
  });
});
