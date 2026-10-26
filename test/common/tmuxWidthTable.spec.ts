import { describe, it, expect } from "vitest";
import { cellWidthOf, isTmuxWidthTable, probedCodepoints, widthFormatFor, widthRunsFromAnswers, type WidthRun } from "../../common/tmuxWidthTable";

describe("widthRunsFromAnswers", () => {
  it("keeps only the widths that are not 1, merging neighbours of the same width", () => {
    expect(widthRunsFromAnswers([0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5], ["1", "2", "2", "0", "2", "1"])).toEqual([
      [0xa1, 0xa2, 2],
      [0xa3, 0xa3, 0],
      [0xa4, 0xa4, 2],
    ]);
  });

  it("does not merge across a codepoint that was not asked", () => {
    expect(widthRunsFromAnswers([0x100, 0x102], ["2", "2"])).toEqual([
      [0x100, 0x100, 2],
      [0x102, 0x102, 2],
    ]);
  });

  it("reads an answer with surrounding whitespace", () => {
    expect(widthRunsFromAnswers([0x100], [" 2\n"])).toEqual([[0x100, 0x100, 2]]);
  });

  it("is empty when everything is one column, or nothing was asked", () => {
    expect(widthRunsFromAnswers([0x100, 0x101], ["1", "1"])).toEqual([]);
    expect(widthRunsFromAnswers([], [])).toEqual([]);
  });

  it.each([
    ["fewer answers than codepoints", [0x100, 0x101], ["1"]],
    ["more answers than codepoints", [0x100], ["1", "2"]],
    ["an empty answer", [0x100], [""]],
    ["a width tmux never gives", [0x100], ["3"]],
    ["a negative width", [0x100], ["-1"]],
    ["a fraction", [0x100], ["1.5"]],
    ["words", [0x100], ["wide"]],
    ["codepoints out of order", [0x101, 0x100], ["1", "1"]],
    ["a repeated codepoint", [0x100, 0x100], ["1", "1"]],
    ["a codepoint past Unicode", [0x110000], ["1"]],
    ["a negative codepoint", [-1], ["1"]],
  ])("is null for %s", (_label, codepoints, answers) => {
    expect(widthRunsFromAnswers(codepoints, answers)).toBeNull();
  });
});

describe("cellWidthOf", () => {
  const runs: WidthRun[] = [
    [0x300, 0x36f, 0],
    [0x2705, 0x2705, 2],
    [0x3040, 0x309f, 2],
  ];

  it.each([
    [0x00, 0],
    [0x1f, 0],
    [0x20, 1],
    [0x7e, 1],
    [0x7f, 0],
    [0x9f, 0],
    [0xa0, 1],
    [0x2ff, 1],
    [0x300, 0],
    [0x36f, 0],
    [0x370, 1],
    [0x2704, 1],
    [0x2705, 2],
    [0x2706, 1],
    [0x3042, 2],
    [0x10ffff, 1],
  ])("U+%s is %i", (codepoint, width) => {
    expect(cellWidthOf(runs, codepoint)).toBe(width);
  });

  it("is one column for anything printable when there are no runs", () => {
    expect(cellWidthOf([], 0x2705)).toBe(1);
  });
});

describe("isTmuxWidthTable", () => {
  const table = { runs: [[0x2705, 0x2705, 2]], folding: "tmux-3.6a", vs16Wide: true };

  it("accepts what the server sends", () => {
    expect(isTmuxWidthTable(table)).toBe(true);
    expect(isTmuxWidthTable({ ...table, runs: [] })).toBe(true);
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["runs missing", { folding: "tmux-3.6a", vs16Wide: true }],
    ["runs not an array", { ...table, runs: "x" }],
    ["a run of width 1", { ...table, runs: [[1, 2, 1]] }],
    ["a run of two numbers", { ...table, runs: [[1, 2]] }],
    ["a run ending before it starts", { ...table, runs: [[5, 4, 2]] }],
    [
      "overlapping runs",
      {
        ...table,
        runs: [
          [1, 5, 2],
          [5, 6, 0],
        ],
      },
    ],
    [
      "runs out of order",
      {
        ...table,
        runs: [
          [7, 8, 2],
          [1, 2, 2],
        ],
      },
    ],
    ["a codepoint past Unicode", { ...table, runs: [[1, 0x110000, 2]] }],
    ["a fractional codepoint", { ...table, runs: [[1.5, 2, 2]] }],
    ["folding missing", { runs: [], vs16Wide: true }],
    ["an unknown folding rule", { ...table, folding: "tmux-9" }],
    ["vs16Wide not a boolean", { ...table, vs16Wide: "on" }],
  ])("refuses %s", (_label, value) => {
    expect(isTmuxWidthTable(value)).toBe(false);
  });
});

describe("probedCodepoints", () => {
  const codepoints = probedCodepoints();

  it("is ascending with no repeats, so the answers can become runs", () => {
    expect(codepoints.every((codepoint, index) => index === 0 || (codepoints[index - 1] ?? -1) < codepoint)).toBe(true);
  });

  it("asks nothing tmux cannot print, and nothing that is not a character", () => {
    expect(codepoints.some((codepoint) => codepoint < 0xa0)).toBe(false);
    expect(codepoints.some((codepoint) => codepoint >= 0xd800 && codepoint <= 0xdfff)).toBe(false);
  });

  it.each([
    ["the first codepoint after C1", 0xa0],
    ["a checkmark", 0x2705],
    ["a variation selector", 0xfe0f],
    ["an emoji", 0x1f600],
    ["a CJK extension B ideograph", 0x20000],
    ["a tag", 0xe0041],
  ])("includes %s", (_label, codepoint) => {
    expect(codepoints).toContain(codepoint);
  });
});

describe("widthFormatFor", () => {
  it("asks for each codepoint's width, comma-separated", () => {
    expect(widthFormatFor([0x2705, 0x3042])).toBe("#{w:#{l:\u2705}},#{w:#{l:\u3042}}");
  });

  it("escapes what a tmux format would read as syntax", () => {
    expect(widthFormatFor([0x23, 0x2c, 0x7d])).toBe("#{w:#{l:##}},#{w:#{l:#,}},#{w:#{l:#}}}");
  });

  it("is empty for nothing", () => {
    expect(widthFormatFor([])).toBe("");
  });
});
