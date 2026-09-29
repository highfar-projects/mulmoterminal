import { describe, it, expect } from "vitest";
import { markdownOutline, plainHeadingText } from "../../../src/components/markdownOutline";

// #2576. The headings the outline lists — the ones the Preview draws, in its order.
describe("markdownOutline", () => {
  it("reads ATX headings with their level and line", () => {
    expect(markdownOutline("# One\ntext\n## Two ##\n###### Six")).toEqual([
      { level: 1, text: "One", line: 1 },
      { level: 2, text: "Two", line: 3 },
      { level: 6, text: "Six", line: 4 },
    ]);
  });

  it("ignores a # that is not a heading", () => {
    expect(markdownOutline("#hashtag\n####### seven\n    # indented code\n\\# escaped")).toEqual([]);
  });

  it("reads a one-line setext heading", () => {
    expect(markdownOutline("Title\n=====\n\nSub\n---\n")).toEqual([
      { level: 1, text: "Title", line: 1 },
      { level: 2, text: "Sub", line: 4 },
    ]);
  });

  it("does not take a list item or a rule under a paragraph as a heading", () => {
    expect(markdownOutline("- item\n---\n")).toEqual([]);
    expect(markdownOutline("\n---\n")).toEqual([]);
  });

  it("skips headings inside a code fence, ``` or ~~~, until the same fence closes", () => {
    const source = ["# Real", "```md", "# not a heading", "~~~", "# still code", "```", "~~~~", "## also code", "~~~~", "## After"].join("\n");
    expect(markdownOutline(source).map((h) => h.text)).toEqual(["Real", "After"]);
  });

  it("skips YAML front matter, as the Preview does, but not an unclosed one", () => {
    expect(markdownOutline("---\ntitle: x\n# comment in yaml\n---\n# Body").map((h) => h.line)).toEqual([5]);
    expect(markdownOutline("---\n# Heading\n").map((h) => h.text)).toEqual(["Heading"]);
  });

  it("reads CRLF files with the same lines", () => {
    expect(markdownOutline("# A\r\n\r\n## B\r\n")).toEqual([
      { level: 1, text: "A", line: 1 },
      { level: 2, text: "B", line: 3 },
    ]);
  });

  it("is empty for a file with no headings, or an empty one", () => {
    expect(markdownOutline("just text")).toEqual([]);
    expect(markdownOutline("")).toEqual([]);
  });
});

describe("plainHeadingText", () => {
  it.each([
    ["Plain", "Plain"],
    ["With **bold** and `code`", "With bold and code"],
    ["See [the docs](./docs.md)", "See the docs"],
    ["Trailing hashes ###", "Trailing hashes"],
  ])("reads %j as %j", (raw, text) => {
    expect(plainHeadingText(raw)).toBe(text);
  });
});
