import { describe, it, expect } from "vitest";
import { infoWord, previewCodeBlocks } from "../../common/previewCodeBlocks";

// #2615. The blocks the Preview draws, in its order, taken from the file — the pane copies from these.
describe("previewCodeBlocks", () => {
  it("lists every code block in document order, nested ones where they stand", () => {
    const md = [
      '```ts title="a"',
      "const a = 1;",
      "```",
      "",
      "- item",
      "",
      "  ```sh",
      "  echo in-list",
      "  ```",
      "",
      "> ~~~",
      "> quoted",
      "> ~~~",
      "",
      "    indented code",
      "",
    ].join("\n");
    expect(previewCodeBlocks(md)).toEqual([
      { lang: "ts", text: "const a = 1;" },
      { lang: "sh", text: "echo in-list" },
      { lang: "", text: "quoted" },
      { lang: "", text: "indented code" },
    ]);
  });

  it("keeps the text exactly, markup and all", () => {
    expect(previewCodeBlocks("```html\n<script>alert(1)</script>\n  \t&amp;\n```\n")).toEqual([{ lang: "html", text: "<script>alert(1)</script>\n  \t&amp;" }]);
  });

  it("leaves out the front matter the Preview drops, and inline code", () => {
    const md = "---\ntitle: x\nnote: |\n  ```\n  not a block\n  ```\n---\n\nSome `inline` code.\n\n```\nbody\n```\n";
    expect(previewCodeBlocks(md)).toEqual([{ lang: "", text: "body" }]);
  });

  it.each([[""], ["no code at all\n"], ["```\nnever closed"], ["<pre>\n```\nhtml\n```\n</pre>\n"]])("copes with %j", (md) => {
    expect(() => previewCodeBlocks(md)).not.toThrow();
  });

  it("counts an unclosed fence as a block running to the end, as marked draws it", () => {
    expect(previewCodeBlocks("text\n\n```js\nlet a;\n")).toEqual([{ lang: "js", text: "let a;" }]);
  });
});

describe("infoWord", () => {
  it.each([
    ["ts", "ts"],
    [' ts title="x"', "ts"],
    ["", ""],
    [undefined, ""],
    ["   ", ""],
  ])("reads %j as %j", (lang, expected) => {
    expect(infoWord(lang)).toBe(expected);
  });
});
