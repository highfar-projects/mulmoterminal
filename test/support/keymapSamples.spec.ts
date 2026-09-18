// @vitest-environment node
//
// Both directions, on inline markdown. The repo-scanning spec that uses this
// (test/docs/keymap-samples.spec.ts) can only ever report "nothing wrong" — which is also what a
// broken extractor reports — so the proof that it can speak at all lives here.
import { describe, it, expect } from "vitest";
import { isSketch, jsonBlocks, keymapSampleProblems, keymapSamples } from "./keymapSamples.js";

const page = (...blocks: string[]) => blocks.map((body) => "```json\n" + body + "\n```").join("\n\nprose between the blocks\n\n");

describe("jsonBlocks", () => {
  it("finds every fenced json block and numbers them as the page does", () => {
    const blocks = jsonBlocks(page('{ "a": 1 }', '{ "b": 2 }'));
    expect(blocks.map((b) => b.ordinal)).toEqual([1, 2]);
    expect(blocks[0].text.trim()).toBe('{ "a": 1 }');
  });

  it("strips the blockquote prefix, so a sample inside a note reads as JSON", () => {
    const [block] = jsonBlocks('> ```json\n> { "keymap": { "zoom-next": "PageDown" } }\n> ```');
    expect(JSON.parse(block.text)).toEqual({ keymap: { "zoom-next": "PageDown" } });
  });

  it("survives CRLF — CI checks out on Windows too", () => {
    expect(jsonBlocks('```json\r\n{ "a": 1 }\r\n```')).toHaveLength(1);
  });

  it("ignores a fence of another language", () => {
    expect(jsonBlocks('```ts\nconst keymap = { "zoom-next": "PageDown" };\n```')).toEqual([]);
  });
});

describe("keymapSamples", () => {
  it("keeps only the blocks carrying a keymap", () => {
    const markdown = page('{ "theme": "midnight" }', '{ "keymap": { "zoom-next": "PageDown" } }');
    expect(keymapSamples(markdown).map((b) => b.ordinal)).toEqual([2]);
  });

  it("treats a block containing an ellipsis as a sketch and leaves it alone", () => {
    const sketch = '{ "keymap": { "send": [ … ] } }';
    expect(isSketch({ ordinal: 1, text: sketch })).toBe(true);
    expect(keymapSamples(page(sketch))).toEqual([]);
  });
});

describe("keymapSampleProblems", () => {
  it("says nothing about a page whose samples are all good", () => {
    const markdown = page(
      '{ "keymap": { "zoom-next": "PageDown", "zoom-prev": "Shift+PageUp" } }',
      '{ "keymap": { "send": [{ "key": "Cmd+ArrowRight", "bytes": "\\u0005" }] } }',
    );
    expect(keymapSampleProblems(markdown, "fixture.md")).toEqual([]);
  });

  // The finding this whole guard exists for: a sample that parses, loads, and never fires on a Mac.
  it("REPORTS a Cmd+Shift+<uppercase letter> sample, naming the file and which block", () => {
    const problems = keymapSampleProblems(page('{ "keymap": { "next-attention": "Cmd+Shift+A" } }'), "guide/en/config.md");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("guide/en/config.md json block #1");
    expect(problems[0]).toContain("next-attention");
    expect(problems[0]).toContain("macOS");
  });

  it("reports a malformed binding, an unknown action and a duplicated keystroke", () => {
    expect(keymapSampleProblems(page('{ "keymap": { "zoom-next": "Hyper+X" } }'), "f.md")[0]).toContain("unparseable");
    expect(keymapSampleProblems(page('{ "keymap": { "warp-drive": "F5" } }'), "f.md")[0]).toContain("unknown action");
    expect(keymapSampleProblems(page('{ "keymap": { "zoom-next": "F5", "zoom-prev": "F5" } }'), "f.md")[0]).toContain("same keystroke");
  });

  it("reports a sample that is not valid JSON rather than skipping it", () => {
    expect(keymapSampleProblems(page('{ "keymap": { "zoom-next": "PageDown", } }'), "f.md")[0]).toContain("not valid JSON");
  });

  it("reports a sample that parses to something other than an object", () => {
    expect(keymapSampleProblems(page('["keymap"]'), "f.md")[0]).toContain("not a JSON object");
  });

  it("names each offending block when a page ships more than one", () => {
    const markdown = page(
      '{ "keymap": { "next-attention": "Cmd+Shift+A" } }',
      '{ "keymap": { "zoom-next": "PageDown" } }',
      '{ "keymap": { "zoom-prev": "Cmd+Shift+B" } }',
    );
    expect(keymapSampleProblems(markdown, "f.md").map((p) => p.split(":")[0])).toEqual(["f.md json block #1", "f.md json block #3"]);
  });
});
