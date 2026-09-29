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

  // What the Preview draws after a line that ended a block — another heading's underline, a rule, a
  // comment — and what it does not: a line that continues a paragraph, a list item or a quote.
  it.each([
    ["A\n===\nB\n---", ["A", "B"]],
    ["A\n---\nB\n===\nC\n---", ["A", "B", "C"]],
    ["***\nB\n---", ["B"]],
    ["<!-- c -->\nTitle\n=====", ["Title"]],
    ["<!--\nx\n-->\nTitle\n=====", ["Title"]],
    ["a\nb\n---", []],
    ["- item\nB\n---", []],
    ["> q\nB\n===", []],
  ])("reads the setext headings of %j", (source, texts) => {
    expect(markdownOutline(source).map((h) => h.text)).toEqual(texts);
  });

  it("does not count an ideographic space or a tab as indentation it can ignore", () => {
    expect(markdownOutline("\u3000# 見出し\n \t# T\n# Real").map((h) => h.text)).toEqual(["Real"]);
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

  // The Preview drops a block only when it parses as YAML (splitFrontmatter); a `---` rule opening a
  // document is body there, and must be here, or every heading after it is missing and miscounted.
  it("keeps a leading rule that is not YAML front matter, and does not close on `...`", () => {
    expect(markdownOutline("---\n# Intro\nSome text\n---\n# Next\n").map((h) => h.text)).toEqual(["Intro", "Some text", "Next"]);
    expect(markdownOutline("---\ntitle: a\n...\n# A\n---\n# B\n").map((h) => h.text)).toEqual(["B"]);
  });

  it("skips headings inside an HTML comment", () => {
    expect(markdownOutline("<!--\n## TODO\n-->\n# Real\n<!-- # inline -->\n## After").map((h) => h.text)).toEqual(["Real", "After"]);
  });

  it("does not take a backtick line with a backtick in its info string as a fence", () => {
    expect(markdownOutline("```x``` is inline\n\n# Visible\n").map((h) => h.text)).toEqual(["Visible"]);
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
    ["`files_browse` and my_var_name", "files_browse and my_var_name"],
    ["[WIP] feat ~/bin", "[WIP] feat ~/bin"],
    ["A &amp; B \\# not a heading", "A & B # not a heading"],
    ["~~old~~ _new_ ![logo](x.png)", "old new logo"],
    ["a\\*b\\* and a\\_b\\_", "a*b* and a_b_"],
  ])("reads %j as %j", (raw, text) => {
    expect(plainHeadingText(raw)).toBe(text);
  });
});
