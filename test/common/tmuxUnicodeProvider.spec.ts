// @vitest-environment node
//
// The provider in a real (headless) xterm: what lands in which column is xterm's doing, so it is
// read off xterm's buffer rather than off the provider's own answers.
import { describe, it, expect } from "vitest";
import headless from "@xterm/headless";
import { FirstKind, JamoClass } from "../../common/tmuxClusters";
import { TMUX_UNICODE_VERSION, tmuxUnicodeProvider, unpackCell } from "../../common/tmuxUnicodeProvider";
import type { TmuxWidthTable } from "../../common/tmuxWidthTable";

const { Terminal } = headless;

const TABLE: TmuxWidthTable = {
  runs: [
    [0x200d, 0x200d, 0],
    [0x2705, 0x2705, 2],
    [0xfe0f, 0xfe0f, 0],
    [0x1f3fb, 0x1f3ff, 2],
    [0x1f44d, 0x1f44d, 2],
    [0x1f467, 0x1f469, 2],
  ],
  folding: "tmux-3.6a",
  vs16Wide: true,
};

async function cursorAfter(text: string, table: TmuxWidthTable = TABLE): Promise<{ x: number; row: string }> {
  const term = new Terminal({ cols: 40, rows: 3, allowProposedApi: true });
  try {
    term.unicode.register(tmuxUnicodeProvider(table));
    term.unicode.activeVersion = TMUX_UNICODE_VERSION;
    await new Promise<void>((resolve) => term.write(text, resolve));
    return { x: term.buffer.active.cursorX, row: term.buffer.active.getLine(0)?.translateToString(true) ?? "" };
  } finally {
    term.dispose();
  }
}

describe("xterm counting with the tmux table", () => {
  it.each([
    ["the reported row", "[✅]", 4],
    ["a table row", "│ ✅ │ ok │", 11],
    ["a symbol widened by U+FE0F", "☺️x", 3],
    ["a ZWJ family", "\u{1f468}‍\u{1f469}‍\u{1f467}x", 3],
    ["a skin tone", "\u{1f44d}\u{1f3fd}x", 3],
    ["a flag", "\u{1f1ef}\u{1f1f5}x", 3],
    ["an emoji after a letter's ZWJ", "a‍\u{1f469}x", 2],
  ])("puts the cursor where tmux does after %s", async (_label, text, column) => {
    expect((await cursorAfter(text)).x).toBe(column);
  });

  it("keeps the character after an emoji visible", async () => {
    expect((await cursorAfter("[✅]")).row).toBe("[✅]");
  });

  // Indicators two columns wide, so a pair that fails to fold shows up as extra columns.
  it("carries the count of regional indicators, so psmux's flag takes no third", async () => {
    const wideIndicators: TmuxWidthTable = {
      ...TABLE,
      runs: [
        [0x200d, 0x200d, 0],
        [0x2705, 0x2705, 2],
        [0xfe0f, 0xfe0f, 0],
        [0x1f1e6, 0x1f1ff, 2],
        [0x1f3fb, 0x1f3ff, 2],
      ],
    };
    const flagAndOne = "\u{1f1ef}\u{1f1f5}\u{1f1fa}x";
    expect((await cursorAfter(flagAndOne, { ...wideIndicators, folding: "psmux" })).x).toBe(5);
    expect((await cursorAfter(flagAndOne, wideIndicators)).x).toBe(3);
  });

  it("adds the parts up when the table says tmux does not fold", async () => {
    expect((await cursorAfter("\u{1f468}‍\u{1f469}x", { ...TABLE, folding: "none" })).x).toBe(5);
  });
});

describe("unpackCell", () => {
  it("is null for xterm's 'nothing before'", () => {
    expect(unpackCell(0)).toBeNull();
  });

  it("reads back what the provider packed", () => {
    const provider = tmuxUnicodeProvider(TABLE);
    const family = provider.charProperties(0x200d, provider.charProperties(0x1f468, 0));
    expect(unpackCell(family)).toEqual({
      firstKind: FirstKind.SkinToneBase,
      width: 2,
      joined: true,
      endsWithZwj: true,
      lastJamo: JamoClass.None,
      regionalIndicators: 0,
      bytes: 7,
    });
  });

  it.each([
    [0x61, FirstKind.Ascii],
    [0x1f1ef, FirstKind.RegionalIndicator],
    [0x1f3fd, FirstKind.SkinTone],
    [0x1f9df, FirstKind.SkinToneBase],
    [0x1f483, FirstKind.SkinToneBase36a],
    [0x3042, FirstKind.Other],
    [0x10ffff, FirstKind.Other],
  ])("keeps what a rule asks of U+%s as its first codepoint", (codepoint, kind) => {
    expect(unpackCell(tmuxUnicodeProvider(TABLE).charProperties(codepoint, 0))?.firstKind).toBe(kind);
  });

  it("counts a cell's bytes up to the most any rule allows, and holds them there", () => {
    const provider = tmuxUnicodeProvider({ ...TABLE, folding: "none" });
    const zeroWidths = Array.from({ length: 40 }, () => 0x200d);
    const bytes = zeroWidths.reduce((state, codepoint) => provider.charProperties(codepoint, state), provider.charProperties(0x1f468, 0));
    expect(unpackCell(bytes)?.bytes).toBe(63);
  });

  it("is null for a first-codepoint kind it never packs", () => {
    expect(unpackCell((0b111 << 3) | (1 << 1))).toBeNull();
  });

  it("is null for a width xterm never packs", () => {
    expect(unpackCell(0b110)).toBeNull();
  });
});

describe("tmuxUnicodeProvider", () => {
  it("answers wcwidth from the table", () => {
    const provider = tmuxUnicodeProvider(TABLE);
    expect([provider.wcwidth(0x2705), provider.wcwidth(0x263a), provider.wcwidth(0x200d), provider.wcwidth(0x41)]).toEqual([2, 1, 0, 1]);
  });

  it("drops into the cell before without changing its width", () => {
    const provider = tmuxUnicodeProvider(TABLE);
    const letter = provider.charProperties(0x61, 0);
    expect(provider.charProperties(0x3164, letter)).toBe(letter | 1);
  });

  it("drops to nothing at the start of a row", () => {
    expect(tmuxUnicodeProvider(TABLE).charProperties(0x200d, 0)).toBe(0);
  });
});
