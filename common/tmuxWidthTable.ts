// How many columns the tmux on this server gives each character, measured from that tmux (#3173).
// tmux places every character after this one from its own answer, so a terminal that counts
// differently draws the rest of the row off by the difference; agreeing with tmux is the only
// thing that keeps a row straight, whichever Unicode version either side claims.
import { isRecord } from "./isRecord.js";

export type CellWidth = 0 | 1 | 2;

/** An inclusive codepoint range tmux gives a width other than 1. */
export type WidthRun = readonly [first: number, last: number, width: 0 | 2];

/** Which of tmux's sequence-folding rules this tmux follows (see tmuxClusters.ts). */
export const FOLDING_RULES = ["tmux-3.6a", "tmux-3.6", "tmux-3.4", "psmux", "none"] as const;
export type FoldingRule = (typeof FOLDING_RULES)[number];

export interface TmuxWidthTable {
  /** Sorted, non-overlapping. Every codepoint not in a run is one column. */
  runs: readonly WidthRun[];
  folding: FoldingRule;
  /** tmux 3.6's `variation-selector-always-wide`: U+FE0F widens a one-column cell to two. */
  vs16Wide: boolean;
}

const MAX_CODEPOINT = 0x10ffff;
const FIRST_C0_PRINTABLE = 0x20;
const DELETE = 0x7f;
const FIRST_AFTER_C1 = 0xa0;

const isCellWidth = (value: unknown): value is CellWidth => value === 0 || value === 1 || value === 2;

const isCodepoint = (value: unknown): value is number => Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= MAX_CODEPOINT;

const isWidthRun = (value: unknown): value is WidthRun =>
  Array.isArray(value) && value.length === 3 && isCodepoint(value[0]) && isCodepoint(value[1]) && value[0] <= value[1] && (value[2] === 0 || value[2] === 2);

const runsAreOrdered = (runs: readonly WidthRun[]): boolean =>
  runs.every((run, index) => {
    const previous = runs[index - 1];
    return !previous || previous[1] < run[0];
  });

const isAscending = (codepoints: readonly number[]): boolean =>
  codepoints.every((codepoint, index) => {
    const previous = codepoints[index - 1];
    return isCodepoint(codepoint) && (previous === undefined || previous < codepoint);
  });

export const isTmuxWidthTable = (value: unknown): value is TmuxWidthTable =>
  isRecord(value) &&
  Array.isArray(value.runs) &&
  value.runs.every(isWidthRun) &&
  runsAreOrdered(value.runs) &&
  FOLDING_RULES.some((rule) => rule === value.folding) &&
  typeof value.vs16Wide === "boolean";

const parseAnswer = (answer: string): CellWidth | null => {
  const width = Number(answer.trim());
  return answer.trim() !== "" && isCellWidth(width) ? width : null;
};

const extendOrOpen = (runs: WidthRun[], codepoint: number, width: 0 | 2): void => {
  const previous = runs.at(-1);
  if (previous && previous[2] === width && previous[1] === codepoint - 1) runs[runs.length - 1] = [previous[0], codepoint, width];
  else runs.push([codepoint, codepoint, width]);
};

/**
 * Runs from tmux's answers, one answer per codepoint asked, in the order asked (ascending).
 * Null when the answers cannot be trusted: a different count, or anything but 0, 1 or 2.
 */
export function widthRunsFromAnswers(codepoints: readonly number[], answers: readonly string[]): WidthRun[] | null {
  if (codepoints.length !== answers.length) return null;
  const widths = answers.map(parseAnswer);
  if (widths.some((width) => width === null)) return null;
  if (!isAscending(codepoints)) return null;
  const runs: WidthRun[] = [];
  codepoints.forEach((codepoint, index) => {
    const width = widths[index];
    if (width === 0 || width === 2) extendOrOpen(runs, codepoint, width);
  });
  return runs;
}

const widthInRuns = (runs: readonly WidthRun[], codepoint: number): CellWidth => {
  let low = 0;
  let high = runs.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const run = runs[middle];
    if (!run) return 1;
    if (codepoint < run[0]) high = middle - 1;
    else if (codepoint > run[1]) low = middle + 1;
    else return run[2];
  }
  return 1;
};

// The control ranges are never asked of tmux (it cannot print them); xterm never draws them either,
// and its own tables give them these widths.
export function cellWidthOf(runs: readonly WidthRun[], codepoint: number): CellWidth {
  if (codepoint < FIRST_C0_PRINTABLE) return 0;
  if (codepoint < DELETE) return 1;
  if (codepoint < FIRST_AFTER_C1) return 0;
  return widthInRuns(runs, codepoint);
}

// Everything above C1 up to the end of plane 3, and plane 14's tags and variation selectors.
// Planes 4–13 are unassigned and 15–16 are private use: neither is asked, so both count as one
// column. Surrogates are not characters.
const PROBE_RANGES: readonly (readonly [first: number, last: number])[] = [
  [FIRST_AFTER_C1, 0xd7ff],
  [0xe000, 0x3ffff],
  [0xe0000, 0xe01ef],
];

export function probedCodepoints(): number[] {
  return PROBE_RANGES.flatMap(([first, last]) => Array.from({ length: last - first + 1 }, (_, offset) => first + offset));
}

// `#`, `,` and `}` mean something inside a tmux format, and are written `##`, `#,` and `#}` there.
const escapeForFormat = (text: string): string => text.replace(/[#,}]/g, (special) => `#${special}`);

/** One tmux format asking for the width of each codepoint, comma-separated in the same order. */
export const widthFormatFor = (codepoints: readonly number[]): string =>
  codepoints.map((codepoint) => `#{w:#{l:${escapeForFormat(String.fromCodePoint(codepoint))}}}`).join(",");
