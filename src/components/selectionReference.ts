// What the Files pane types at the terminal's prompt for "these lines" (#2575): `@src/a.ts#L10-20`,
// the form Claude Code's IDE integration uses, and plain text to any other agent. Pure, and beside
// filesRowActions because it answers the same question that module does — which spelling of a path
// means the same file at the terminal's end.
import { absoluteUnder } from "../composables/canvasOpenFile";
import { sameDirectory } from "./filesRowActions";

/** A run of whole lines, 1-based and inclusive. */
export interface LineSpan {
  from: number;
  to: number;
}

export interface SelectionReferenceTarget {
  /** The open file, relative to the tree's root. */
  pathRel: string;
  /** The tree's root; null when it is the server's default and resolves against nothing. */
  cwd: string | null;
  /** The terminal's directory. A relative path is offered only when it is the tree's root. */
  terminalCwd: string | null;
  /** The selected lines, or null for none — the reference is then the file alone. */
  lines: LineSpan | null;
}

const lineSuffix = (lines: LineSpan | null): string => {
  if (!lines) return "";
  return lines.from === lines.to ? `#L${lines.from}` : `#L${lines.from}-${lines.to}`;
};

/** The text to insert — space-terminated, so what the user types next is a separate word — or null
 *  when there is no root to resolve the path against. */
export function selectionReference({ pathRel, cwd, terminalCwd, lines }: SelectionReferenceTarget): string | null {
  if (cwd === null || pathRel === "") return null;
  const path = sameDirectory(terminalCwd, cwd) ? pathRel : absoluteUnder(cwd, pathRel);
  return `@${path}${lineSuffix(lines)} `;
}
