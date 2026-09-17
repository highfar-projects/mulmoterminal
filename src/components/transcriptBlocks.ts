// A turn's rows, grouped into the FRAMES the conversation pane draws (#2112).
//
// The pane shows who said what, and a turn arrives as a flat list of rows that alternates between
// speakers several times: you asked, it answered, it ran three things, it answered again. Drawing a
// frame per ROW gives a column of boxes with one line in each; drawing one per SPEAKER RUN gives
// what a chat looks like.
//
// Pure and on its own, so the grouping is pinned by tests rather than only reachable by opening a
// pane over a real session.
import type { TranscriptRow, TranscriptRowKind } from "../../common/transcriptView";

export interface TranscriptBlock {
  kind: TranscriptRowKind;
  rows: TranscriptRow[];
  /** What RAN, for a tool block the reader has collapsed — the call rows' own text, in order.
   *
   *  Empty for every other kind, and empty for a tool block that is all results: the host marks the
   *  calls (`row.call`), and a block with none is output whose call fell outside the window. */
  calls: string[];
}

/** Consecutive rows of one kind, in order. Never merges across a gap: `user, assistant, user` is
 *  three frames, because that is three things being said. */
export function groupTurnRows(rows: readonly TranscriptRow[]): TranscriptBlock[] {
  return rows.reduce<TranscriptBlock[]>((blocks, row) => {
    const last = blocks[blocks.length - 1];
    const block = last?.kind === row.kind ? last : null;
    if (block === null) blocks.push({ kind: row.kind, rows: [row], calls: callsOf([row]) });
    else {
      block.rows.push(row);
      block.calls = callsOf(block.rows);
    }
    return blocks;
  }, []);
}

/** The first line of each call row — the tool's name and, for codex and cursor, the head of its
 *  arguments. One LINE, because the label sits in a collapsed header: the argument head can carry a
 *  newline, and a two-line label pushes the rest of the conversation down to say nothing new. */
const callsOf = (rows: readonly TranscriptRow[]): string[] => rows.filter((row) => row.call === true).map((row) => row.text.split("\n")[0] ?? "");

/** What a collapsed tool block says on its one line.
 *
 *  Names the tools when the host marked them, and falls back to counting rows when it did not — a
 *  block of results whose calls fell outside the window still has to say what it is, or it reads as
 *  an empty frame with a chevron. */
export function toolBlockLabel(block: TranscriptBlock): string {
  if (block.calls.length > 0) return block.calls.join(" · ");
  return block.rows.length === 1 ? "1 tool result" : `${block.rows.length} tool results`;
}
