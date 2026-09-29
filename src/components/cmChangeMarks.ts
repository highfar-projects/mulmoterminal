// Which lines of the Files pane's editor carry a change mark against HEAD (#2497), from the diff's
// chunks. Pure over CodeMirror's `Text`, so which line a mark lands on — the rule that is easy to get
// wrong — is testable without an editor.
//
// A chunk spans whole lines around a change, so a line appended at the end arrives as a chunk that
// also holds the unchanged line before it. The lines both sides share at a chunk's edges are trimmed
// first; what is left is what VS Code's gutter marks.
import type { Text } from "@codemirror/state";
import type { Chunk } from "@codemirror/merge";

/** Lines that are new, lines that changed, and the place where lines were taken out (there is no
 *  line left to mark, so the mark goes on the line after the gap). */
export type ChangeMarkKind = "added" | "modified" | "deleted";

export interface ChangeMark {
  /** 1-based. */
  line: number;
  kind: ChangeMarkKind;
}

type ChunkSpan = Pick<Chunk, "fromA" | "toA" | "fromB" | "toB">;

/** The lines of `text` between `from` and `to`, where `to` may be one past the last line's end. */
function linesIn(text: Text, from: number, to: number): string[] {
  if (from === to) return [];
  const slice = text.sliceString(from, Math.min(to, text.length));
  const lines = slice.split("\n");
  return to > text.length || !slice.endsWith("\n") ? lines : lines.slice(0, -1);
}

/** How many lines at the start, and then at the end, the two sides share. */
function sharedEdges(a: string[], b: string[]): { head: number; tail: number } {
  const limit = Math.min(a.length, b.length);
  const head = Array.from({ length: limit }).findIndex((_, i) => a[i] !== b[i]);
  const start = head < 0 ? limit : head;
  const room = limit - start;
  const tail = Array.from({ length: room }).findIndex((_, i) => a[a.length - 1 - i] !== b[b.length - 1 - i]);
  return { head: start, tail: tail < 0 ? room : tail };
}

function marksOf(chunk: ChunkSpan, original: Text, doc: Text): ChangeMark[] {
  const a = linesIn(original, chunk.fromA, chunk.toA);
  const b = linesIn(doc, chunk.fromB, chunk.toB);
  const { head, tail } = sharedEdges(a, b);
  const removed = a.length - head - tail;
  const kept = b.length - head - tail;
  const firstLine = doc.lineAt(Math.min(chunk.fromB, doc.length)).number + head;
  if (kept === 0 && removed === 0) return [];
  if (kept === 0) return [{ line: Math.min(firstLine, doc.lines), kind: "deleted" }];
  const kind: ChangeMarkKind = removed === 0 ? "added" : "modified";
  return Array.from({ length: kept }, (_, i) => ({ line: firstLine + i, kind }));
}

/** The marks for `chunks` of `original` (HEAD) against the current `doc`. */
export const changeMarks = (chunks: readonly ChunkSpan[], original: Text, doc: Text): ChangeMark[] => chunks.flatMap((chunk) => marksOf(chunk, original, doc));
