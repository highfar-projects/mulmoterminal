// The width table handed to xterm (`term.unicode.register`) so it counts cells the way the tmux on
// this server does. Structural on purpose — no xterm import — so the browser's xterm and a headless
// one in a spec take the same object.
//
// `charProperties` returns xterm's packed per-character value, laid out by its UnicodeService:
// bit 0 "joins the cell before", bits 1–2 the cell's width, bits 3–26 free for the provider. The
// fold state tmux keeps per cell (tmuxClusters.ts) goes in those free bits, because xterm hands the
// previous value back as `preceding` and nothing else survives from one character to the next.
import { clusterStep, type ClusterCell, type JamoClass } from "./tmuxClusters.js";
import { cellWidthOf, type CellWidth, type TmuxWidthTable } from "./tmuxWidthTable.js";

export const TMUX_UNICODE_VERSION = "tmux";

export interface TmuxUnicodeProvider {
  readonly version: string;
  wcwidth(codepoint: number): CellWidth;
  charProperties(codepoint: number, preceding: number): number;
}

const JOIN_BIT = 1;
const WIDTH_SHIFT = 1;
const WIDTH_MASK = 0x3;
const STATE_SHIFT = 3;
const STATE_MASK = 0xffffff;
// Inside the state: the first codepoint, then the joined and ZWJ flags, the jamo class and the count
// of regional indicators. The
// codepoint is only ever compared with ASCII and with characters below U+20000, so anything from
// there up is stored as U+3FFFF — which keeps all of it inside the bits xterm leaves free.
const CODEPOINT_MASK = 0x3ffff;
const JOINED_FLAG_SHIFT = 18;
const ZWJ_FLAG_SHIFT = 19;
const JAMO_SHIFT = 20;
const JAMO_MASK = 0x3;
const INDICATORS_SHIFT = 22;
const INDICATORS_MASK = 0x3;

const packState = (cell: ClusterCell): number =>
  Math.min(cell.first, CODEPOINT_MASK) |
  (Number(cell.joined) << JOINED_FLAG_SHIFT) |
  (Number(cell.endsWithZwj) << ZWJ_FLAG_SHIFT) |
  (cell.lastJamo << JAMO_SHIFT) |
  (cell.regionalIndicators << INDICATORS_SHIFT);

const pack = (cell: ClusterCell, joins: boolean): number =>
  ((packState(cell) & STATE_MASK) << STATE_SHIFT) | ((cell.width & WIDTH_MASK) << WIDTH_SHIFT) | Number(joins);

const isJamoClass = (value: number): value is JamoClass => value >= 0 && value <= JAMO_MASK;

const isCellWidth = (value: number): value is CellWidth => value === 0 || value === 1 || value === 2;

const isIndicatorCount = (value: number): value is ClusterCell["regionalIndicators"] => value === 0 || value === 1 || value === 2;

/** The cell `preceding` describes, or null when xterm says there is none (it passes 0 then). */
export function unpackCell(preceding: number): ClusterCell | null {
  if (preceding === 0) return null;
  const width = (preceding >> WIDTH_SHIFT) & WIDTH_MASK;
  const state = (preceding >>> STATE_SHIFT) & STATE_MASK;
  const lastJamo = (state >> JAMO_SHIFT) & JAMO_MASK;
  const regionalIndicators = (state >> INDICATORS_SHIFT) & INDICATORS_MASK;
  if (!isCellWidth(width) || !isJamoClass(lastJamo) || !isIndicatorCount(regionalIndicators)) return null;
  return {
    first: state & CODEPOINT_MASK,
    width,
    joined: ((state >> JOINED_FLAG_SHIFT) & 1) === 1,
    endsWithZwj: ((state >> ZWJ_FLAG_SHIFT) & 1) === 1,
    lastJamo,
    regionalIndicators,
  };
}

export function tmuxUnicodeProvider(table: TmuxWidthTable): TmuxUnicodeProvider {
  return {
    version: TMUX_UNICODE_VERSION,
    wcwidth: (codepoint) => cellWidthOf(table.runs, codepoint),
    charProperties: (codepoint, preceding) => {
      const previous = unpackCell(preceding);
      const step = clusterStep(table, codepoint, previous);
      if (step.kind === "new") return pack(step.cell, false);
      if (step.kind === "join") return pack(step.cell, true);
      // Dropped: fold it into the cell before without changing its width, which draws nothing new.
      return previous ? preceding | JOIN_BIT : 0;
    },
  };
}
