// Which characters tmux folds into the cell before them, and how wide that cell becomes: a mirror of
// `screen_write_combine` in tmux 3.6a (screen-write.c, with utf8_should_combine and
// hanguljamo_check_state from utf8-combined.c). tmux redraws a folded cell as one unit, so a
// terminal that adds the parts up instead — a ZWJ family as three emoji, `☺️` as one column — puts
// everything after it on that row in the wrong place.
//
// Whether a given tmux behaves like this is measured, not assumed (tmuxWidthProbe.ts): an older
// tmux folds less, and then only the per-codepoint table is used (`clusters: false`).
import { cellWidthOf, type CellWidth, type TmuxWidthTable } from "./tmuxWidthTable.js";

// Numbers rather than names: the provider packs the class into xterm's per-character state.
export const JamoClass = { None: 0, Choseong: 1, Jungseong: 2, Jongseong: 3 } as const;
export type JamoClass = (typeof JamoClass)[keyof typeof JamoClass];

/** The cell a character may fold into: what tmux looks at in it. */
export interface ClusterCell {
  /** utf8_should_combine decodes a cell's bytes with mbtowc, which yields its FIRST codepoint. */
  first: number;
  width: CellWidth;
  endsWithZwj: boolean;
  /** The class of the cell's last codepoint; hanguljamo_check_state reads its last three bytes. */
  lastJamo: JamoClass;
}

export type ClusterStep = { kind: "new"; cell: ClusterCell } | { kind: "join"; cell: ClusterCell } | { kind: "drop" };

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

// The bases tmux 3.6a lets a skin tone fold into, as listed in utf8_should_combine.
const SKIN_TONE_BASES: ReadonlySet<number> = new Set([
  0x1f44b, 0x1f44c, 0x1f44d, 0x1f44e, 0x1f44f, 0x1f450, 0x1f466, 0x1f467, 0x1f468, 0x1f469, 0x1f46e, 0x1f470, 0x1f471, 0x1f472, 0x1f473, 0x1f474, 0x1f475,
  0x1f476, 0x1f477, 0x1f478, 0x1f47c, 0x1f481, 0x1f482, 0x1f483, 0x1f485, 0x1f486, 0x1f487, 0x1f4aa, 0x1f575, 0x1f57a, 0x1f590, 0x1f595, 0x1f596, 0x1f645,
  0x1f646, 0x1f647, 0x1f64b, 0x1f64c, 0x1f64d, 0x1f64e, 0x1f64f, 0x1f6b4, 0x1f6b5, 0x1f6b6, 0x1f926, 0x1f937, 0x1f938, 0x1f939, 0x1f93d, 0x1f93e, 0x1f9b5,
  0x1f9b6, 0x1f9b8, 0x1f9b9, 0x1f9cd, 0x1f9ce, 0x1f9cf, 0x1f9d1, 0x1f9d2, 0x1f9d3, 0x1f9d4, 0x1f9d5, 0x1f9d6, 0x1f9d7, 0x1f9d8, 0x1f9d9, 0x1f9da, 0x1f9db,
  0x1f9dc, 0x1f9dd, 0x1f9de, 0x1f9df,
]);

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

// utf8_should_combine, asked both ways round as screen_write_combine does.
const shouldCombine = (cellFirst: number, codepoint: number): boolean =>
  (isRegionalIndicator(cellFirst) && isRegionalIndicator(codepoint)) ||
  (isSkinTone(codepoint) && SKIN_TONE_BASES.has(cellFirst)) ||
  (isSkinTone(cellFirst) && SKIN_TONE_BASES.has(codepoint));

const lastJamoOf = (codepoint: number): JamoClass => (codepoint < FIRST_FOUR_BYTE ? jamoClassOf(codepoint) : JamoClass.None);

const newCell = (codepoint: number, width: CellWidth): ClusterStep => ({
  kind: "new",
  cell: { first: codepoint, width, endsWithZwj: false, lastJamo: lastJamoOf(codepoint) },
});

const joinCell = (previous: ClusterCell, codepoint: number, width: CellWidth): ClusterStep => ({
  kind: "join",
  cell: { first: previous.first, width, endsWithZwj: codepoint === ZWJ, lastJamo: lastJamoOf(codepoint) },
});

type JamoVerdict = "drop" | "new" | "fold" | "not-jamo";
type Fold = "new" | "drop" | "fold" | "fold-wide";

// hanguljamo_check_state: a vowel or final with nothing to compose onto is thrown away.
const jamoVerdict = (previous: ClusterCell, codepoint: number): JamoVerdict => {
  const jamo = jamoClassOf(codepoint);
  if (jamo === JamoClass.None) return "not-jamo";
  if (jamo === JamoClass.Choseong) return "new";
  const wants = jamo === JamoClass.Jungseong ? JamoClass.Choseong : JamoClass.Jungseong;
  return previous.lastJamo === wants ? "fold" : "drop";
};

// Whether a character that is not zero-width folds in, and whether it forces the cell wide.
const foldOfVisible = (previous: ClusterCell, codepoint: number): Fold => {
  const jamo = jamoVerdict(previous, codepoint);
  if (jamo !== "not-jamo") return jamo;
  if (shouldCombine(previous.first, codepoint)) return "fold-wide";
  return previous.endsWithZwj ? "fold" : "new";
};

const DROP: ClusterStep = { kind: "drop" };

// What an older tmux does, and what xterm's own tables do: only a zero-width character folds.
const perCodepointStep = (codepoint: number, width: CellWidth, previous: ClusterCell | null): ClusterStep =>
  width === 0 && previous && previous.width > 0 ? joinCell(previous, codepoint, previous.width) : newCell(codepoint, width);

const foldOfZeroWidth = (table: TmuxWidthTable, codepoint: number): Fold => (codepoint === VS16 && table.vs16Wide ? "fold-wide" : "fold");

const applyFold = (fold: Fold, previous: ClusterCell, codepoint: number, width: CellWidth): ClusterStep => {
  if (fold === "new") return newCell(codepoint, width);
  if (fold === "drop") return DROP;
  return joinCell(previous, codepoint, fold === "fold-wide" && previous.width === 1 ? 2 : previous.width);
};

/**
 * What tmux does with `codepoint` written right after `previous` (null at the start of a row or
 * after anything that is not a cell): start a new cell, fold into the previous one, or drop it.
 */
export function clusterStep(table: TmuxWidthTable, codepoint: number, previous: ClusterCell | null): ClusterStep {
  const width = cellWidthOf(table.runs, codepoint);
  if (!table.clusters) return perCodepointStep(codepoint, width, previous);
  if (codepoint === HANGUL_FILLER) return DROP;
  const zeroWidth = codepoint === ZWJ || codepoint === VS16 || width === 0;
  // An ASCII character never folds, and nothing folds into the start of a row or an empty cell.
  if (codepoint < FIRST_MULTIBYTE || !previous || previous.width === 0) return zeroWidth ? DROP : newCell(codepoint, width);
  const fold = zeroWidth ? foldOfZeroWidth(table, codepoint) : foldOfVisible(previous, codepoint);
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

// Sequences that only come out right when tmux folds the way clusterStep says: a variation
// selector, a ZWJ family, a skin tone, a flag, a keycap, and an emoji after a ZWJ on a letter.
export const CLUSTER_SAMPLES: readonly string[] = ["☺️", "\u{1f468}‍\u{1f469}‍\u{1f467}", "\u{1f44d}\u{1f3fd}", "\u{1f1ef}\u{1f1f5}", "1️⃣", "a‍\u{1f469}"];
