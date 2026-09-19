// What a content search IS, for the two sides that decide it together (#2140).
//
// In `common/` because BOTH ends read these rules, not because they happen to share a shape: the
// server builds git's argv from them, and the browser applies the same literal and case rules to
// the one file open in the editor with unsaved edits — which no on-disk search can see. If the two
// drifted, that one file would answer to a different notion of "case-insensitive" than every other
// file in the list.
//
// LITERAL MODE ONLY. In regex mode the browser does not search that buffer at all: the pattern
// comes from the query, and running one on the thread that draws the UI can hang the tab (the
// measurement is on `literalMatch`). The file is dropped and the panel says so.
//
// The git-specific half — argv, output parsing, the exit codes — stays in
// `server/files/file-search.ts`, where nothing in the browser has any use for it.
import { byCodeUnit } from "./byCodeUnit.js";

/** How many matching LINES are returned across the whole search. */
export const MAX_SEARCH_MATCHES = 500;

/** How many matching lines any ONE file may contribute. Without it a single generated file answers
 *  the whole budget and the result reads as "only this file matches". */
export const MAX_MATCHES_PER_FILE = 20;

/** How much of a matching line is carried. A minified bundle is one line of a hundred thousand
 *  characters, and shipping it whole would cost more than every other result together. */
export const MAX_SNIPPET_CHARS = 400;

/** Shorter than the shared git timeout: this runs while the user is typing. A repository too slow
 *  to answer inside it gives an empty result that says it is incomplete, not a hung panel. */
export const SEARCH_TIMEOUT_MS = 10_000;

export interface SearchRequest {
  query: string;
  /** Treat the query as a regular expression rather than as literal characters. */
  regex: boolean;
  /** Force case sensitivity. Absent means SMART CASE — see `wantsCaseSensitive`. */
  caseSensitive?: boolean;
}

/** One matching line. `line` is 1-based, as git reports it and as an editor counts. */
export interface SearchMatch {
  /** Relative to the searched directory, `/`-separated — the same spelling `/api/files/browse/*`
   *  already speaks, so a result can be opened without translation. */
  path: string;
  line: number;
  /** The matching line, cut to MAX_SNIPPET_CHARS. */
  text: string;
  /** The line was longer than the cap and `text` is its beginning. */
  clipped: boolean;
}

export interface SearchResult {
  matches: SearchMatch[];
  /** Some matches are NOT here — a cap cut the list, or git stopped early. The one wrong answer a
   *  search can give is "it is not there" when it only means "I did not look at all of it", so this
   *  is reported rather than inferred from the array's length (which cannot show a per-file cut). */
  truncated: boolean;
  /** `git` answered from a repository, so `.gitignore` was applied. `no-index` means it did not —
   *  there is no ignore file to apply outside a repository, and the UI says so rather than letting
   *  the reader assume one was read. */
  source: "git" | "no-index";
}

/** Smart case: a query typed entirely in lower case matches either case, and one carrying an
 *  upper-case letter is taken literally. It is what every comparable tool does, which is the whole
 *  argument — a hand reaches for it without being taught.
 *
 *  Decided on the query and NOT on a locale-aware fold: `toLowerCase()` on a Turkish `I` produces a
 *  dotless `ı` under some locales, so the comparison is against the code points as typed. */
export function wantsCaseSensitive(request: SearchRequest): boolean {
  if (request.caseSensitive !== undefined) return request.caseSensitive;
  return [...request.query].some((ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase());
}

/** A query with nothing to search for. Rejected rather than run: an empty pattern matches every
 *  line of every file, which is a slow way to answer nothing useful. Whitespace alone IS a real
 *  query — someone looking for a tab or trailing space means it — so only the empty string counts. */
export const isSearchable = (query: string): boolean => query.length > 0;

/** Matches grouped by file, files in path order and lines in file order — the shape the panel
 *  renders, decided here so the ordering is one rule rather than one per view.
 *
 *  `byCodeUnit` rather than `localeCompare` for the reason the file list already uses it: a locale
 *  comparison reorders the same project differently on two machines. */
export function groupByFile(matches: SearchMatch[]): { path: string; matches: SearchMatch[] }[] {
  const byPath = new Map<string, SearchMatch[]>();
  matches.forEach((match) => {
    const existing = byPath.get(match.path);
    if (existing) existing.push(match);
    else byPath.set(match.path, [match]);
  });
  return [...byPath.keys()].sort(byCodeUnit).map((path) => ({ path, matches: (byPath.get(path) ?? []).sort((a, b) => a.line - b.line) }));
}

/** Whether a LITERAL query matches a line, under the same case rule the server applies.
 *
 *  A plain string search, deliberately — not a RegExp built from the query. `(a+)+b` against a
 *  THIRTY-TWO character line takes the better part of a minute in a JS engine, so a regex built
 *  from untrusted text cannot run on the thread that draws the UI: the tab would freeze, taking the
 *  unsaved buffer this whole mechanism exists to respect with it.
 *
 *  Literal is the default mode and needs no regex to begin with, which is what makes the default
 *  path both correct and unable to hang. Regex mode does not come here at all — see
 *  `withBufferMatches`. */
function literalMatch(line: string, request: SearchRequest): boolean {
  if (wantsCaseSensitive(request)) return line.includes(request.query);
  return line.toLowerCase().includes(request.query.toLowerCase());
}

/** The matching lines of one in-memory buffer, in the shape the disk search returns.
 *
 *  This exists because an unsaved buffer is invisible to ANY on-disk search — git, ripgrep or a
 *  hand-rolled scan alike — and the pane can have one. It is affordable precisely because there is
 *  at most one: `FilesPane` opens a single file, so this is never a scan of a project.
 *
 *  LITERAL QUERIES ONLY. The caller decides that; see `withBufferMatches`. */
export function matchesInBuffer(path: string, text: string, request: SearchRequest): SearchMatch[] {
  const out: SearchMatch[] = [];
  text.split("\n").forEach((raw, index) => {
    if (out.length >= MAX_MATCHES_PER_FILE) return;
    const line = raw.replace(/\r$/, "");
    if (!literalMatch(line, request)) return;
    out.push({ path, line: index + 1, text: line.slice(0, MAX_SNIPPET_CHARS), clipped: line.length > MAX_SNIPPET_CHARS });
  });
  return out;
}

/** What the panel shows, once the open buffer has had its say. */
export interface BufferMerge {
  matches: SearchMatch[];
  /** The open buffer was NOT searched, so a match in it is not in this list. True only in regex
   *  mode — see `withBufferMatches`. The panel has to SAY this: silence would read as "there is
   *  nothing in that file", which is the one wrong answer a search can give. */
  bufferUnsearched: boolean;
}

/**
 * Disk matches with the open buffer's own answer substituted for it.
 *
 * The trap this closes is the INVERSE of the obvious one. Missing a match in an unsaved file is a
 * loud failure — nothing appears. But a match found ON DISK in a file that is open and edited is a
 * QUIET one: the line number and the snippet describe the saved text, so the snippet shows
 * something not on screen and jumping lands in the wrong place.
 *
 * So the file's disk matches are dropped entirely rather than merged: the two describe different
 * documents and there is no correspondence between their line numbers. **That half holds in BOTH
 * modes** — it needs no matching at all, only the knowledge that the file has diverged.
 *
 * What regex mode loses is the second half: the buffer is not searched, because doing so means
 * running an untrusted pattern on the UI thread (see `literalMatch`). The file is dropped and the
 * panel says so, which is the safe direction — a note the reader can act on by saving the file,
 * rather than a frozen tab or a line number pointing at the wrong place.
 */
export function withBufferMatches(diskMatches: SearchMatch[], buffer: { path: string; text: string } | null, request: SearchRequest): BufferMerge {
  if (!buffer) return { matches: diskMatches, bufferUnsearched: false };
  const withoutStale = diskMatches.filter((match) => match.path !== buffer.path);
  if (request.regex) return { matches: withoutStale, bufferUnsearched: true };
  return { matches: [...withoutStale, ...matchesInBuffer(buffer.path, buffer.text, request)], bufferUnsearched: false };
}

/** How many lines above and below a selected match the panel shows. Small on purpose: the block
 *  replaces a one-line row, so every extra line pushes the rest of the list further down. */
export const CONTEXT_RADIUS_LINES = 2;

/** One line of a context window. Carries `clipped` for the reason `SearchMatch` does — a silently
 *  cut line is indistinguishable from a short one, and a minified file's single line is enormous. */
export interface WindowLine {
  text: string;
  clipped: boolean;
}

/** The lines around one line of a file. */
export interface LineWindow {
  /** 1-based line number of `lines[0]`. Meaningless when `lines` is empty. */
  from: number;
  lines: WindowLine[];
}

/**
 * The lines around `around` (1-based), clamped to the text.
 *
 * In `common/` because BOTH sides run it: the server over a file it read from disk, the browser
 * over the buffer being edited — whose surroundings no on-disk read can produce. One rule rather
 * than two, so the file on screen does not get a different notion of "the lines around this one"
 * than every other file in the list.
 *
 * `around` past the end gives an EMPTY window rather than the tail of the file: the search answered
 * before this read, so a file that shrank in between has no such line, and showing the last lines
 * instead would put text on screen under a line number that does not hold it.
 */
export function lineWindow(text: string, around: number, radius: number): LineWindow {
  const split = text.split("\n");
  // A file ending in a newline splits into a trailing "" that is not a line — git does not count
  // it and neither does an editor. Only ONE is dropped: "a\n\n" really does have a blank line 2.
  const all = split.length > 1 && split[split.length - 1] === "" ? split.slice(0, -1) : split;
  const from = Math.max(1, around - radius);
  const to = Math.min(all.length, around + radius);
  if (around > all.length || to < from) return { from, lines: [] };
  return {
    from,
    lines: all.slice(from - 1, to).map((raw) => {
      const line = raw.replace(/\r$/, "");
      return { text: line.slice(0, MAX_SNIPPET_CHARS), clipped: line.length > MAX_SNIPPET_CHARS };
    }),
  };
}
