// Which characters tmux folds into the cell before them, and how wide that cell becomes: mirrors of
// `screen_write_combine` (screen-write.c and utf8-combined.c). tmux redraws a folded cell as one
// unit, so a terminal that adds the parts up instead — a ZWJ family as three emoji, `☺️` as one
// column — puts everything after it on that row in the wrong place.
//
// The rule changed between releases, so there is one mirror per rule, and which one this tmux
// follows is measured, not assumed (tmuxWidthProbe.ts):
// - "tmux-3.6a": utf8_should_combine pairs regional indicators and listed skin-tone bases, asked both
//   ways round; Hangul jamo compose by class, `variation-selector-always-wide` decides U+FE0F.
// - "tmux-3.6": the same, but asked one way only (a base after a skin tone), and U+1F483 is unlisted.
// - "tmux-3.4" (3.4 and 3.5): anything in the modifier table (regional indicators, skin tones) folds
//   into any cell that is not a lone ASCII byte, and U+FE0F always widens.
// - "psmux": psmux's `join` (crates/vt100-psmux/src/width.rs), which copies 3.6a's but takes no third
//   regional indicator into a flag and has no Hangul jamo composition.
// - "none": only zero-width characters fold — what an older tmux and xterm's own tables do.
import { cellWidthOf, type CellWidth, type FoldingRule, type TmuxWidthTable } from "./tmuxWidthTable.js";

// Numbers rather than names: the provider packs the class into xterm's per-character state.
export const JamoClass = { None: 0, Choseong: 1, Jungseong: 2, Jongseong: 3 } as const;
export type JamoClass = (typeof JamoClass)[keyof typeof JamoClass];

// What a rule asks of a cell's first codepoint, and nothing more: the provider has to fit the whole
// cell into xterm's 24 free bits, and the codepoint itself would take 18 of them.
export const FirstKind = { Other: 0, Ascii: 1, RegionalIndicator: 2, SkinTone: 3, SkinToneBase: 4, SkinToneBase36a: 5 } as const;
export type FirstKind = (typeof FirstKind)[keyof typeof FirstKind];

/** The cell a character may fold into: what tmux looks at in it. */
export interface ClusterCell {
  /** tmux decodes a cell's bytes with mbtowc, which yields its FIRST codepoint; this is its kind. */
  firstKind: FirstKind;
  width: CellWidth;
  /** Whether anything has folded into it; a lone ASCII character is the one cell of one byte. */
  joined: boolean;
  endsWithZwj: boolean;
  /** The class of the cell's last codepoint; hanguljamo_check_state reads its last three bytes. */
  lastJamo: JamoClass;
  /** How many regional indicators the cell holds, counted to two: psmux pairs only a lone one. */
  regionalIndicators: 0 | 1 | 2;
  /** The cell's UTF-8 bytes: tmux and psmux fold nothing past a fixed size (cellBytesLimit). */
  bytes: number;
}

export type ClusterStep = { kind: "new"; cell: ClusterCell } | { kind: "join"; cell: ClusterCell } | { kind: "drop" };

type Fold = "new" | "drop" | "fold" | "fold-wide";

const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const HANGUL_FILLER = 0x3164;
const FIRST_MULTIBYTE = 0x80;
const FIRST_REGIONAL_INDICATOR = 0x1f1e6;
const LAST_REGIONAL_INDICATOR = 0x1f1ff;
const FIRST_SKIN_TONE = 0x1f3fb;
const LAST_SKIN_TONE = 0x1f3ff;
// U+10000 and above take four UTF-8 bytes, so their last three are not a jamo.
const FIRST_FOUR_BYTE = 0x10000;

// The bases tmux 3.6a lets a skin tone fold into, as listed in utf8_should_combine. 3.6 lacks U+1F483.
const SKIN_TONE_BASES: ReadonlySet<number> = new Set([
  0x1f44b, 0x1f44c, 0x1f44d, 0x1f44e, 0x1f44f, 0x1f450, 0x1f466, 0x1f467, 0x1f468, 0x1f469, 0x1f46e, 0x1f470, 0x1f471, 0x1f472, 0x1f473, 0x1f474, 0x1f475,
  0x1f476, 0x1f477, 0x1f478, 0x1f47c, 0x1f481, 0x1f482, 0x1f483, 0x1f485, 0x1f486, 0x1f487, 0x1f4aa, 0x1f575, 0x1f57a, 0x1f590, 0x1f595, 0x1f596, 0x1f645,
  0x1f646, 0x1f647, 0x1f64b, 0x1f64c, 0x1f64d, 0x1f64e, 0x1f64f, 0x1f6b4, 0x1f6b5, 0x1f6b6, 0x1f926, 0x1f937, 0x1f938, 0x1f939, 0x1f93d, 0x1f93e, 0x1f9b5,
  0x1f9b6, 0x1f9b8, 0x1f9b9, 0x1f9cd, 0x1f9ce, 0x1f9cf, 0x1f9d1, 0x1f9d2, 0x1f9d3, 0x1f9d4, 0x1f9d5, 0x1f9d6, 0x1f9d7, 0x1f9d8, 0x1f9d9, 0x1f9da, 0x1f9db,
  0x1f9dc, 0x1f9dd, 0x1f9de, 0x1f9df,
]);

const BASE_ADDED_IN_36A = 0x1f483;

// tmux's UTF8_SIZE (32 since 3.6, 21 before) and psmux's MAX_CELL_BYTES.
const CELL_BYTES_LIMIT: Readonly<Record<Exclude<FoldingRule, "none">, number>> = { "tmux-3.6a": 32, "tmux-3.6": 32, "tmux-3.4": 21, psmux: 32 };
const LAST_ONE_BYTE = 0x7f;
const LAST_TWO_BYTE = 0x7ff;
const LAST_THREE_BYTE = 0xffff;

const JAMO_RANGES: readonly (readonly [first: number, last: number, jamo: JamoClass])[] = [
  [0x1100, 0x115f, JamoClass.Choseong],
  [0x1160, 0x11a7, JamoClass.Jungseong],
  [0x11a8, 0x11ff, JamoClass.Jongseong],
  [0xa960, 0xa97c, JamoClass.Choseong],
  [0xd7b0, 0xd7c6, JamoClass.Jungseong],
  [0xd7cb, 0xd7fb, JamoClass.Jongseong],
];

export const jamoClassOf = (codepoint: number): JamoClass =>
  JAMO_RANGES.find(([first, last]) => codepoint >= first && codepoint <= last)?.[2] ?? JamoClass.None;

const isRegionalIndicator = (codepoint: number): boolean => codepoint >= FIRST_REGIONAL_INDICATOR && codepoint <= LAST_REGIONAL_INDICATOR;
const isSkinTone = (codepoint: number): boolean => codepoint >= FIRST_SKIN_TONE && codepoint <= LAST_SKIN_TONE;

const lastJamoOf = (codepoint: number): JamoClass => (codepoint < FIRST_FOUR_BYTE ? jamoClassOf(codepoint) : JamoClass.None);

export function firstKindOf(codepoint: number): FirstKind {
  if (codepoint < FIRST_MULTIBYTE) return FirstKind.Ascii;
  if (isRegionalIndicator(codepoint)) return FirstKind.RegionalIndicator;
  if (isSkinTone(codepoint)) return FirstKind.SkinTone;
  if (codepoint === BASE_ADDED_IN_36A) return FirstKind.SkinToneBase36a;
  return SKIN_TONE_BASES.has(codepoint) ? FirstKind.SkinToneBase : FirstKind.Other;
}

export function utf8Length(codepoint: number): number {
  if (codepoint <= LAST_ONE_BYTE) return 1;
  if (codepoint <= LAST_TWO_BYTE) return 2;
  return codepoint <= LAST_THREE_BYTE ? 3 : 4;
}

const newCell = (codepoint: number, width: CellWidth): ClusterStep => ({
  kind: "new",
  cell: {
    firstKind: firstKindOf(codepoint),
    width,
    joined: false,
    endsWithZwj: false,
    lastJamo: lastJamoOf(codepoint),
    regionalIndicators: isRegionalIndicator(codepoint) ? 1 : 0,
    bytes: utf8Length(codepoint),
  },
});

const countedIndicators = (previous: ClusterCell, codepoint: number): ClusterCell["regionalIndicators"] => {
  if (!isRegionalIndicator(codepoint)) return previous.regionalIndicators;
  return previous.regionalIndicators === 0 ? 1 : 2;
};

const joinCell = (previous: ClusterCell, codepoint: number, width: CellWidth): ClusterStep => ({
  kind: "join",
  cell: {
    firstKind: previous.firstKind,
    width,
    joined: true,
    endsWithZwj: codepoint === ZWJ,
    lastJamo: lastJamoOf(codepoint),
    regionalIndicators: countedIndicators(previous, codepoint),
    bytes: previous.bytes + utf8Length(codepoint),
  },
});

const DROP: ClusterStep = { kind: "drop" };

const applyFold = (fold: Fold, previous: ClusterCell, codepoint: number, width: CellWidth): ClusterStep => {
  if (fold === "new") return newCell(codepoint, width);
  if (fold === "drop") return DROP;
  return joinCell(previous, codepoint, fold === "fold-wide" && previous.width === 1 ? 2 : previous.width);
};

// "none": what an older tmux does, and what xterm's own tables do.
const perCodepointStep = (codepoint: number, width: CellWidth, previous: ClusterCell | null): ClusterStep =>
  width === 0 && previous && previous.width > 0 ? joinCell(previous, codepoint, previous.width) : newCell(codepoint, width);

type Rule36 = "tmux-3.6" | "tmux-3.6a";

const isSkinToneBase = (rule: Rule36, kind: FirstKind): boolean =>
  kind === FirstKind.SkinToneBase || (rule === "tmux-3.6a" && kind === FirstKind.SkinToneBase36a);

// utf8_should_combine(with, add): a regional-indicator pair, or a listed base added to a skin tone.
const shouldCombine = (rule: Rule36, withKind: FirstKind, addKind: FirstKind): boolean =>
  (withKind === FirstKind.RegionalIndicator && addKind === FirstKind.RegionalIndicator) || (withKind === FirstKind.SkinTone && isSkinToneBase(rule, addKind));

// 3.6a's screen_write_combine also asks the other way round, so a skin tone folds into a base too.
const combines36 = (rule: Rule36, cellKind: FirstKind, codepoint: number): boolean => {
  const addKind = firstKindOf(codepoint);
  return shouldCombine(rule, cellKind, addKind) || (rule === "tmux-3.6a" && shouldCombine(rule, addKind, cellKind));
};

// hanguljamo_check_state (3.6): a vowel or final with nothing to compose onto is thrown away.
const jamoFold36 = (previous: ClusterCell, jamo: JamoClass): Fold => {
  if (jamo === JamoClass.Choseong) return "new";
  const wants = jamo === JamoClass.Jungseong ? JamoClass.Choseong : JamoClass.Jungseong;
  return previous.lastJamo === wants ? "fold" : "drop";
};

const visibleFold36 = (rule: Rule36, previous: ClusterCell, codepoint: number): Fold => {
  const jamo = jamoClassOf(codepoint);
  if (jamo !== JamoClass.None) return jamoFold36(previous, jamo);
  if (combines36(rule, previous.firstKind, codepoint)) return "fold-wide";
  return previous.endsWithZwj ? "fold" : "new";
};

// psmux's should_combine, asked both ways round: a flag takes no third indicator, and jamo are
// counted by their width alone.
const visibleFoldPsmux = (previous: ClusterCell, codepoint: number): Fold => {
  const pairsFlag = previous.firstKind === FirstKind.RegionalIndicator && isRegionalIndicator(codepoint);
  if (pairsFlag ? previous.regionalIndicators === 1 : combines36("tmux-3.6a", previous.firstKind, codepoint)) return "fold-wide";
  return previous.endsWithZwj ? "fold" : "new";
};

// utf8_is_modifier (3.4): `last.data.size < 2` refuses only a lone ASCII byte.
const visibleFold34 = (previous: ClusterCell, codepoint: number): Fold => {
  if (isRegionalIndicator(codepoint) || isSkinTone(codepoint)) return !previous.joined && previous.firstKind === FirstKind.Ascii ? "new" : "fold-wide";
  return previous.endsWithZwj ? "fold" : "new";
};

const zeroWidthFold = (table: TmuxWidthTable, codepoint: number): Fold => {
  const widens = table.folding === "tmux-3.4" || table.vs16Wide;
  return codepoint === VS16 && widens ? "fold-wide" : "fold";
};

const visibleFold = (folding: Exclude<FoldingRule, "none">, previous: ClusterCell, codepoint: number): Fold => {
  if (folding === "tmux-3.4") return visibleFold34(previous, codepoint);
  if (folding === "psmux") return visibleFoldPsmux(previous, codepoint);
  return visibleFold36(folding, previous, codepoint);
};

/**
 * What tmux does with `codepoint` written right after `previous` (null at the start of a row or
 * after anything that is not a cell): start a new cell, fold into the previous one, or drop it.
 */
export function clusterStep(table: TmuxWidthTable, codepoint: number, previous: ClusterCell | null): ClusterStep {
  const width = cellWidthOf(table.runs, codepoint);
  if (table.folding === "none") return perCodepointStep(codepoint, width, previous);
  if (codepoint === HANGUL_FILLER && table.folding !== "tmux-3.4") return DROP;
  const zeroWidth = codepoint === ZWJ || codepoint === VS16 || width === 0;
  // An ASCII character never folds, and nothing folds into the start of a row or an empty cell.
  if (codepoint < FIRST_MULTIBYTE || !previous || previous.width === 0) return zeroWidth ? DROP : newCell(codepoint, width);
  const fold = zeroWidth ? zeroWidthFold(table, codepoint) : visibleFold(table.folding, previous, codepoint);
  // A fold that would take the cell past its size is refused, after every other check, as in tmux.
  const folds = fold === "fold" || fold === "fold-wide";
  if (folds && previous.bytes + utf8Length(codepoint) > CELL_BYTES_LIMIT[table.folding]) return zeroWidth ? DROP : newCell(codepoint, width);
  return applyFold(fold, previous, codepoint, width);
}

/** How many columns tmux advances for `text`, written from the start of a row. */
export function rowWidthOf(table: TmuxWidthTable, text: string): number {
  const { columns } = Array.from(text).reduce<{ columns: number; previous: ClusterCell | null }>(
    (row, character) => {
      const step = clusterStep(table, character.codePointAt(0) ?? 0, row.previous);
      if (step.kind === "drop") return row;
      const grown = step.kind === "new" ? step.cell.width : step.cell.width - (row.previous?.width ?? 0);
      return { columns: row.columns + grown, previous: step.cell };
    },
    { columns: 0, previous: null },
  );
  return columns;
}

// Sequences whose width tells the rules apart: a variation selector, a ZWJ family, a skin tone, a
// flag, a keycap, an emoji after a ZWJ on a letter, and a skin tone after an accented letter (3.4
// folds it, 3.6 does not). The skin tone after its base is what tells 3.6a from 3.6. Written as codepoints so no invisible joiner sits in the source.
export const CLUSTER_SAMPLES: readonly string[] = [
  [0x263a, 0xfe0f],
  [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467],
  [0x1f44d, 0x1f3fd],
  [0x1f1ef, 0x1f1f5],
  [0x31, 0xfe0f, 0x20e3],
  [0x61, 0x200d, 0x1f469],
  [0xe9, 0x1f3fd],
].map((codepoints) => String.fromCodePoint(...codepoints));
