// xterm's own `term.getSelection()` is correct wherever a wrap is real terminal autowrap: it
// knows via each row's `isWrapped` flag and stitches those rows back together with no character
// between them. What it can't know is a CLI that does its OWN wrapping and sends a genuine line
// break instead of leaning on the terminal's autowrap — a long URL or path that Claude Code's
// own TUI has to hard-split for want of room, the same problem server/session/screen-rows.ts
// fixes for the phone bridge's captured screen. xterm sees that line break as no different from
// an intentional one and joins it with a real "\n", which is exactly what breaks a copied URL.
//
// dewrappedSelection rebuilds xterm's own text, replacing only that specific kind of "\n" — the
// one following a row that ran flush to the terminal's right edge with nothing left to eat, so
// there was no space or blank line there to begin with — with nothing. Everywhere else, xterm's
// own text (including its choice of "\r\n" vs "\n", and a selection this can't reason about,
// such as a column/block selection) is left untouched.
import type { Terminal } from "@xterm/xterm";

const rowIsFull = (term: Terminal, row: number): boolean => term.buffer.active.getLine(row)?.translateToString(true).length === term.cols;

export function dewrappedSelection(term: Terminal): string {
  const raw = term.getSelection();
  const position = term.getSelectionPosition();
  if (!position || position.start.y === position.end.y) return raw;
  // One entry per segment xterm's own algorithm folded consecutive isWrapped rows into — the
  // LAST physical row of each, since that is the row whose fullness the join right after it
  // depends on.
  const segmentEndRows = [position.start.y];
  for (let y = position.start.y + 1; y <= position.end.y; y++) {
    if (term.buffer.active.getLine(y)?.isWrapped) segmentEndRows[segmentEndRows.length - 1] = y;
    else segmentEndRows.push(y);
  }
  const parts = raw.split(/(\r\n|\n)/); // segments at even indices, their leading separator at odd
  // A mismatch means this selection took a path the grouping above doesn't model — a column/
  // block selection is the one case, where xterm never merges rows at all. Leaving xterm's own
  // text alone beats guessing against a count that doesn't add up.
  if ((parts.length + 1) / 2 !== segmentEndRows.length) return raw;
  let result = parts[0] ?? "";
  for (let i = 1; i < parts.length; i += 2) {
    const separator = parts[i] ?? "\n";
    const segment = parts[i + 1] ?? "";
    const endRow = segmentEndRows[(i - 1) / 2];
    result += (endRow !== undefined && rowIsFull(term, endRow) ? "" : separator) + segment;
  }
  return result;
}
