// How one content-search result is SHOWN (#2159) — the rules the panel renders from, out of the
// component so they can be tested without mounting it.
//
// Nothing here runs on the server: a match's position is wanted for drawing, and the server has
// already decided what matched. Which is also why a disagreement here is harmless — see
// `literalMatchRanges`.
import { wantsCaseSensitive, type SearchRequest } from "../../common/fileSearch";
import { highlightParts, type HighlightPart } from "./filePathMatch";

/** The narrowest row this assumes, in characters. A match is brought inside it, and a match already
 *  inside it is left alone.
 *
 *  A constant rather than a measurement: the width in CHARACTERS depends on the font the user has,
 *  and measuring would make this impure to gain nothing — being wrong costs an ellipsis on a row
 *  that did not need one, never a match off screen.
 *
 *  It is a FLOOR, deliberately low: the panel is `min(620px, 100% - 24px)`, so on a phone it really
 *  is narrow. Which is why the cut below puts the match at the END of this budget rather than at
 *  its start — the lead is then as long as the guarantee allows instead of a fixed stub. At a fixed
 *  stub the screenshot's row rendered as `…ns) doesn't apply.` on a row with room for three times
 *  that, throwing away the very context the scroll exists to preserve. */
const ASSUMED_ROW_CHARS = 40;

/** Half-open, in CODE UNITS — the same units `highlightParts` indexes by. */
export interface MatchRange {
  start: number;
  end: number;
}

/** Whether `query` sits at `at`, comparing one code unit at a time.
 *
 *  Not `slice().toLowerCase()`: lowercasing can CHANGE LENGTH (`"İ".toLowerCase()` is two code
 *  units), so an index taken in the folded string does not address the original — which is the one
 *  thing a highlight must get right. Comparing per code unit never re-indexes, so it cannot slip. */
const sitsAt = (text: string, query: string, at: number, fold: boolean): boolean =>
  query.split("").every((ch, k) => {
    const here = text[at + k];
    if (here === undefined) return false;
    return here === ch || (fold && here.toLowerCase() === ch.toLowerCase());
  });

/**
 * Where a LITERAL query occurs in a line.
 *
 * A scan, never a RegExp built from the query — the same rule, and the same reason, as
 * `literalMatch` in `common/fileSearch.ts`: a pattern from the query box cannot be run on the
 * thread that draws the UI.
 *
 * This fold is its own, and is deliberately NOT wired into `literalMatch`. The server matched with
 * git's `-i` and this decides only where to draw, so the two can disagree on some exotic character
 * without harm: the row then renders exactly as it did before highlighting existed. Making them one
 * rule would mean changing what `matchesInBuffer` MATCHES, which is a real behaviour change in
 * exchange for a cosmetic one.
 *
 * Empty in regex mode: there is no safe way to learn a regex's position here.
 */
export function literalMatchRanges(text: string, request: SearchRequest): MatchRange[] {
  const { query } = request;
  if (query.length === 0 || request.regex || query.length > text.length) return [];
  const fold = !wantsCaseSensitive(request);
  return Array.from({ length: text.length - query.length + 1 }, (_, at) => at)
    .filter((at) => sitsAt(text, query, at, fold))
    .reduce<MatchRange[]>((ranges, start) => {
      // Overlapping occurrences are one highlight, not two — `aa` in `aaa` starts twice and the
      // second start is inside the first run.
      const last = ranges[ranges.length - 1];
      if (last && start < last.end) return ranges;
      return [...ranges, { start, end: start + query.length }];
    }, []);
}

export interface SnippetView {
  /** The line cut into matched / unmatched runs, ready to render. */
  parts: HighlightPart[];
  /** The BEGINNING of the line was dropped so the match would be on screen. The panel marks it, or
   *  the row reads as a line that starts mid-word. */
  elided: boolean;
}

/**
 * One result line, scrolled so the match is visible and cut into highlight runs.
 *
 * The row is a fixed-width window onto a line that can be much wider, so a match far along it is
 * simply not on screen — the panel was shipped showing `doesn't ap…` for a query of `apply`, which
 * is a result whose whole point is invisible (#2159).
 *
 * With no ranges — regex mode, or a fold disagreement — this is the line as it always was.
 */
export function snippetView(text: string, request: SearchRequest): SnippetView {
  const ranges = literalMatchRanges(text, request);
  const first = ranges[0];
  // Cut so the match ENDS at the budget's edge, which keeps every character of lead the guarantee
  // permits. Never past the match's own start: a query longer than the budget cannot be brought
  // inside it, and showing its beginning beats showing its middle.
  const cut = first ? Math.max(0, Math.min(first.end - ASSUMED_ROW_CHARS, first.start)) : 0;
  const indexes = ranges.flatMap(({ start, end }) => Array.from({ length: end - start }, (_, k) => start + k - cut)).filter((index) => index >= 0);
  return { parts: highlightParts(text.slice(cut), indexes), elided: cut > 0 };
}

/** "12 matches in 8 files" — what the list adds up to, which a reader cannot get by scrolling it.
 *
 *  Both counts, because either alone misleads in a direction: matches alone hides that they are in
 *  one generated file, files alone hides that one of them holds most of them. */
export function resultSummary(matchCount: number, fileCount: number): string {
  const matches = `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
  return `${matches} in ${fileCount} ${fileCount === 1 ? "file" : "files"}`;
}

/** One line of a context window, carrying the number it holds in the file. */
export interface NumberedLine {
  line: number;
  text: string;
  clipped: boolean;
}

/** A context window split into what is above the match and what is below it.
 *
 *  The matched line itself belongs to NEITHER: the row already draws it, highlighted and scrolled
 *  to the match, and the window's own copy has none of that. Split by line NUMBER rather than by
 *  position, so a window that does not contain the match at all — the file changed between the
 *  search and the read — simply puts every line on one side instead of mislabelling one of them. */
export function splitAround(
  window: { from: number; lines: { text: string; clipped: boolean }[] },
  at: number,
): { before: NumberedLine[]; after: NumberedLine[] } {
  const numbered = window.lines.map((line, offset) => ({ line: window.from + offset, text: line.text, clipped: line.clipped }));
  return { before: numbered.filter((line) => line.line < at), after: numbered.filter((line) => line.line > at) };
}
