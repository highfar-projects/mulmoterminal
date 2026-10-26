import { describe, it, expect } from "vitest";
import { CLUSTER_SAMPLES, FirstKind, JamoClass, clusterStep, jamoClassOf, rowWidthOf } from "../../common/tmuxClusters";
import { FOLDING_RULES, type TmuxWidthTable, type WidthRun } from "../../common/tmuxWidthTable";
import { PSMUX_WIDTH_RUNS } from "../../common/psmuxWidthRuns";

// The per-codepoint answers tmux 3.6a (utf8proc) gave for the characters used below.
const RUNS: WidthRun[] = [
  [0x0301, 0x0301, 0],
  [0x1100, 0x115f, 2],
  [0x1160, 0x11ff, 0],
  [0x200d, 0x200d, 0],
  [0x20e3, 0x20e3, 0],
  [0x2705, 0x2705, 2],
  [0x3042, 0x3042, 2],
  [0xac01, 0xac01, 2],
  [0xfe0e, 0xfe0f, 0],
  [0x1f3fb, 0x1f3ff, 2],
  [0x1f44d, 0x1f44d, 2],
  [0x1f467, 0x1f469, 2],
];
const TMUX_36: TmuxWidthTable = { runs: RUNS, folding: "tmux-3.6a", vs16Wide: true };
// tmux 3.4 and 3.5 have no `variation-selector-always-wide`; the probe reads it as off.
const TMUX_34: TmuxWidthTable = { runs: RUNS, folding: "tmux-3.4", vs16Wide: false };

describe("rowWidthOf, against what tmux 3.6a's own grid measured", () => {
  it.each([
    ["a symbol", "☺", 1],
    ["a symbol + U+FE0F", "☺️", 2],
    ["the reply marker + U+FE0F", "⏺️", 2],
    ["a wide emoji", "✅", 2],
    ["a wide emoji + U+FE0F", "✅️", 2],
    ["a wide emoji + U+FE0E", "✅︎", 2],
    ["a symbol + U+FE0E", "☺︎", 1],
    ["a ZWJ family", "\u{1f468}‍\u{1f469}‍\u{1f467}", 2],
    ["a skin tone", "\u{1f44d}\u{1f3fd}", 2],
    ["two skin tones", "\u{1f44d}\u{1f3fd}\u{1f3fd}", 2],
    ["a skin tone after a letter", "a\u{1f3fd}", 3],
    ["one regional indicator", "\u{1f1ef}", 1],
    ["a flag", "\u{1f1ef}\u{1f1f5}", 2],
    ["three regional indicators", "\u{1f1ef}\u{1f1f5}\u{1f1fa}", 2],
    ["a keycap", "1️⃣", 2],
    ["letters around a ZWJ", "a‍b", 2],
    ["a letter after an emoji's ZWJ", "\u{1f468}‍a", 3],
    ["an emoji after a letter's ZWJ", "a‍\u{1f469}", 1],
    ["a lone combining accent", "́", 0],
    ["a letter and a combining accent", "é", 1],
    ["a wide kana + U+FE0F", "あ️", 2],
  ])("%s", (_label, text, columns) => {
    expect(rowWidthOf(TMUX_36, text)).toBe(columns);
  });

  it("counts every sample the boot probe checks", () => {
    expect(CLUSTER_SAMPLES.map((sample) => rowWidthOf(TMUX_36, sample))).toEqual([2, 2, 2, 2, 2, 1, 3]);
  });

  it("is zero for nothing", () => {
    expect(rowWidthOf(TMUX_36, "")).toBe(0);
  });
});

// Read from tmux 3.4's screen_write_combine, and matching what the tmux 3.4 on Ubuntu CI drew for the
// family, the three regional indicators, the doubled skin tone and the emoji after a letter's ZWJ.
describe("rowWidthOf under tmux 3.4's rule", () => {
  it.each([
    ["a ZWJ family", "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}", 2],
    ["three regional indicators", "\u{1f1ef}\u{1f1f5}\u{1f1fa}", 2],
    ["two skin tones", "\u{1f44d}\u{1f3fd}\u{1f3fd}", 2],
    ["letters around an emoji after a ZWJ", "a\u200d\u{1f469}b", 2],
    ["a skin tone after a lone letter", "a\u{1f3fd}", 3],
    ["a skin tone after an accented letter", "\u00e9\u{1f3fd}", 2],
    ["a skin tone after a letter that has something folded in", "a\u0301\u{1f3fd}", 2],
    ["a symbol + U+FE0F, with no option to say so", "\u263a\ufe0f", 2],
    ["the Hangul filler, which it prints", "\u3164", 1],
  ])("%s", (_label, text, columns) => {
    expect(rowWidthOf(TMUX_34, text)).toBe(columns);
  });

  // psmux is not told apart by measuring: it is the rule a psmux server gets.
  it("tells every tmux rule apart on the samples", () => {
    const tmuxRules = FOLDING_RULES.filter((rule) => rule !== "psmux");
    const widths = (folding: TmuxWidthTable["folding"]) => JSON.stringify(CLUSTER_SAMPLES.map((sample) => rowWidthOf({ ...TMUX_36, folding }, sample)));
    expect(new Set(tmuxRules.map(widths)).size).toBe(tmuxRules.length);
  });
});

// tag 3.6 asks utf8_should_combine one way only: a base after a skin tone. The widths are what the
// reporter of #3173 measured with `#{cursor_x}` on Ubuntu's tmux 3.6 under WSL2.
describe("rowWidthOf under tmux 3.6's rule", () => {
  const TMUX_36_TAG: TmuxWidthTable = { ...TMUX_36, folding: "tmux-3.6" };

  it.each([
    ["a skin tone after its base", "\u{1f44d}\u{1f3fd}", 4],
    ["a base after a skin tone", "\u{1f3fd}\u{1f44d}", 2],
    ["a ZWJ family", "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}", 2],
    ["a flag", "\u{1f1ef}\u{1f1f5}", 2],
    ["a keycap", "1\ufe0f\u20e3", 2],
  ])("%s", (_label, text, columns) => {
    expect(rowWidthOf(TMUX_36_TAG, text)).toBe(columns);
  });

  it("does not list the dancer, which 3.6a added", () => {
    const withDancer: TmuxWidthTable = { ...TMUX_36, runs: [...RUNS, [0x1f483, 0x1f483, 2]] };
    expect(rowWidthOf({ ...withDancer, folding: "tmux-3.6" }, "\u{1f3fd}\u{1f483}")).toBe(4);
    expect(rowWidthOf(withDancer, "\u{1f3fd}\u{1f483}")).toBe(2);
  });

  it("counts the samples as the reporter's tmux 3.6 drew them", () => {
    expect(CLUSTER_SAMPLES.map((sample) => rowWidthOf(TMUX_36_TAG, sample))).toEqual([2, 2, 4, 2, 2, 1, 3]);
  });
});

// The widths are what the reporter of #3180 read with `#{cursor_x}` on psmux 3.4.0 (Windows), against
// the table generated from the crate psmux counts with.
describe("rowWidthOf under psmux's rule", () => {
  const PSMUX: TmuxWidthTable = { runs: PSMUX_WIDTH_RUNS, folding: "psmux", vs16Wide: true };

  it.each([
    ["a wide emoji", "\u2705", 2],
    ["an ambiguous-width digit", "\u2460", 1],
    ["a kana", "\u3042", 2],
    ["an emoji", "\u{1f44d}", 2],
    ["a lone skin tone", "\u{1f3fd}", 2],
    ["a symbol + U+FE0F", "\u263a\ufe0f", 2],
    ["a ZWJ family", "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}", 2],
    ["a skin tone after its base", "\u{1f44d}\u{1f3fd}", 2],
    ["a base after a skin tone", "\u{1f3fd}\u{1f44d}", 2],
    ["a flag", "\u{1f1ef}\u{1f1f5}", 2],
    ["a keycap", "1\ufe0f\u20e3", 2],
    ["a skin tone after an accented letter", "\u00e9\u{1f3fd}", 3],
    ["an emoji after a letter's ZWJ", "a\u200d\u{1f469}", 1],
  ])("%s", (_label, text, columns) => {
    expect(rowWidthOf(PSMUX, text)).toBe(columns);
  });

  it("takes no third regional indicator into a flag, where tmux 3.6a does", () => {
    const flagAndOne = "\u{1f1ef}\u{1f1f5}\u{1f1fa}";
    expect(rowWidthOf(PSMUX, flagAndOne)).toBe(3);
    expect(rowWidthOf({ ...PSMUX, folding: "tmux-3.6a" }, flagAndOne)).toBe(2);
  });

  it("counts emoji added after Unicode 11 as two columns, as unicode-width 0.2.2 does", () => {
    expect(["\u{1f971}", "\u{1fae0}", "\u{1fabf}"].map((emoji) => rowWidthOf(PSMUX, emoji))).toEqual([2, 2, 2]);
  });

  it("composes no Hangul jamo: a vowel with width of its own starts a cell", () => {
    const visibleVowels: TmuxWidthTable = {
      ...PSMUX,
      runs: [
        [0x1100, 0x115f, 2],
        [0x1160, 0x11a7, 2],
      ],
    };
    expect(rowWidthOf(visibleVowels, "\u1100\u1161")).toBe(4);
    expect(rowWidthOf({ ...visibleVowels, folding: "tmux-3.6a" }, "\u1100\u1161")).toBe(2);
  });
});

// UTF8_SIZE is 21 in tmux 3.4/3.5 and 32 from 3.6; psmux's MAX_CELL_BYTES is 32. The 3.6a and 3.6
// widths are what those tmux grids drew (tmuxWidthProbe.spec.ts prints the same rows).
describe("a cell that is full", () => {
  const table = (folding: TmuxWidthTable["folding"]): TmuxWidthTable => ({ runs: PSMUX_WIDTH_RUNS, folding, vs16Wide: true });
  // The sequence before the x is 25 bytes: its last emoji is past 21.
  const familyOfFour = "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}\u200d\u{1f466}x";
  // The sequence before the x is 41 bytes: the ZWJ that would take it past 32 is dropped, so the last emoji starts a cell.
  const tonedFamilyOfFour = "\u{1f468}\u{1f3fd}\u200d\u{1f469}\u{1f3fd}\u200d\u{1f467}\u{1f3fd}\u200d\u{1f466}\u{1f3fd}x";

  it.each([
    ["tmux-3.4", familyOfFour, 5],
    ["tmux-3.6a", familyOfFour, 3],
    ["tmux-3.6", familyOfFour, 3],
    ["psmux", familyOfFour, 3],
    ["tmux-3.6a", tonedFamilyOfFour, 5],
    // Tag 3.6 folds a skin tone only before its base, so each tone here is a cell of its own.
    ["tmux-3.6", tonedFamilyOfFour, 11],
    ["psmux", tonedFamilyOfFour, 5],
  ] as const)("%s: %j", (folding, text, columns) => {
    expect(rowWidthOf(table(folding), text)).toBe(columns);
  });

  it("drops a zero-width character that does not fit, rather than starting a cell with it", () => {
    const step = clusterStep(table("tmux-3.6a"), 0x200d, {
      firstKind: FirstKind.SkinToneBase,
      width: 2,
      joined: true,
      endsWithZwj: false,
      lastJamo: JamoClass.None,
      regionalIndicators: 0,
      bytes: 30,
    });
    expect(step).toEqual({ kind: "drop" });
  });

  it("still folds what fits exactly", () => {
    const full = {
      firstKind: FirstKind.SkinToneBase,
      width: 2,
      joined: true,
      endsWithZwj: false,
      lastJamo: JamoClass.None,
      regionalIndicators: 0,
      bytes: 29,
    } as const;
    expect(clusterStep(table("tmux-3.6a"), 0x200d, full)).toMatchObject({ kind: "join", cell: { bytes: 32 } });
  });
});

describe("a tmux that does not fold sequences", () => {
  const perCodepoint: TmuxWidthTable = { ...TMUX_36, folding: "none" };

  it("adds the parts up, folding only zero-width characters", () => {
    expect(rowWidthOf(perCodepoint, "\u{1f468}‍\u{1f469}‍\u{1f467}")).toBe(6);
    expect(rowWidthOf(perCodepoint, "\u{1f44d}\u{1f3fd}")).toBe(4);
    expect(rowWidthOf(perCodepoint, "é")).toBe(1);
  });

  it("does not widen on U+FE0F", () => {
    expect(rowWidthOf(perCodepoint, "☺️")).toBe(1);
  });
});

describe("variation-selector-always-wide off", () => {
  it("leaves a one-column symbol one column", () => {
    expect(rowWidthOf({ ...TMUX_36, vs16Wide: false }, "☺️")).toBe(1);
  });
});

describe("Hangul jamo", () => {
  it("folds a vowel onto an initial consonant", () => {
    expect(rowWidthOf(TMUX_36, "가")).toBe(2);
    expect(rowWidthOf(TMUX_36, "각")).toBe(2);
  });

  it("drops a zero-width vowel with nothing before it", () => {
    expect(rowWidthOf(TMUX_36, "ᅡ")).toBe(0);
  });

  describe("where tmux gives a vowel a width of its own", () => {
    const visibleVowels: TmuxWidthTable = { ...TMUX_36, runs: RUNS.map((run): WidthRun => (run[0] === 0x1160 ? [0x1160, 0x11ff, 2] : run)) };

    it("composes it onto a consonant", () => {
      expect(rowWidthOf(visibleVowels, "가")).toBe(2);
    });

    it("throws it away when there is nothing to compose onto", () => {
      expect(rowWidthOf(visibleVowels, "aᅡ")).toBe(1);
      expect(rowWidthOf(visibleVowels, "あᅡ")).toBe(2);
      expect(rowWidthOf(visibleVowels, "ᄀᆨ")).toBe(2);
    });
  });

  it.each([
    [0x1100, JamoClass.Choseong],
    [0x115f, JamoClass.Choseong],
    [0x1160, JamoClass.Jungseong],
    [0x11a7, JamoClass.Jungseong],
    [0x11a8, JamoClass.Jongseong],
    [0x11ff, JamoClass.Jongseong],
    [0xa960, JamoClass.Choseong],
    [0xa97c, JamoClass.Choseong],
    [0xa97d, JamoClass.None],
    [0xd7b0, JamoClass.Jungseong],
    [0xd7c6, JamoClass.Jungseong],
    [0xd7c7, JamoClass.None],
    [0xd7cb, JamoClass.Jongseong],
    [0xd7fb, JamoClass.Jongseong],
    [0x10ff, JamoClass.None],
    [0xac00, JamoClass.None],
  ])("U+%s is jamo class %i", (codepoint, jamo) => {
    expect(jamoClassOf(codepoint)).toBe(jamo);
  });
});

describe("clusterStep", () => {
  it("drops the Hangul filler wherever it is", () => {
    expect(clusterStep(TMUX_36, 0x3164, null)).toEqual({ kind: "drop" });
    expect(
      clusterStep(TMUX_36, 0x3164, {
        firstKind: FirstKind.Ascii,
        width: 1,
        joined: false,
        endsWithZwj: false,
        lastJamo: JamoClass.None,
        regionalIndicators: 0,
        bytes: 1,
      }),
    ).toEqual({ kind: "drop" });
  });

  it("never folds a character after a cell of width 0", () => {
    expect(
      clusterStep(TMUX_36, 0x200d, {
        firstKind: FirstKind.Other,
        width: 0,
        joined: false,
        endsWithZwj: false,
        lastJamo: JamoClass.None,
        regionalIndicators: 0,
        bytes: 2,
      }),
    ).toEqual({ kind: "drop" });
  });

  it("starts a cell for a letter even after a ZWJ", () => {
    expect(
      clusterStep(TMUX_36, 0x61, {
        firstKind: FirstKind.SkinToneBase,
        width: 2,
        joined: true,
        endsWithZwj: true,
        lastJamo: JamoClass.None,
        regionalIndicators: 0,
        bytes: 7,
      }),
    ).toMatchObject({ kind: "new" });
  });

  it("remembers the kind of the first codepoint, the bytes, and that the cell ends in a ZWJ", () => {
    expect(
      clusterStep(TMUX_36, 0x200d, {
        firstKind: FirstKind.SkinToneBase,
        width: 2,
        joined: false,
        endsWithZwj: false,
        lastJamo: JamoClass.None,
        regionalIndicators: 0,
        bytes: 4,
      }),
    ).toEqual({
      kind: "join",
      cell: { firstKind: FirstKind.SkinToneBase, width: 2, joined: true, endsWithZwj: true, lastJamo: JamoClass.None, regionalIndicators: 0, bytes: 7 },
    });
  });
});
