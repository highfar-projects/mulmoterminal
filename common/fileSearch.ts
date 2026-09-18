// What a content search IS, for the two sides that decide it together (#2140).
//
// In `common/` because BOTH ends read these rules, not because they happen to share a shape: the
// server builds git's argv from them, and the browser applies the SAME rules to the one file open
// in the editor with unsaved edits — which no on-disk search can see. If the two drifted, that one
// file would answer to a different notion of "case-insensitive" than every other file in the list.
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

/** The regex one search means, for matching text the DISK does not have — the buffer open in the
 *  editor with unsaved edits. Built from the same request the server hands git, so the one file the
 *  user is editing is not judged by different rules than every other file in the same list.
 *
 *  A literal query is escaped rather than passed through: someone searching for `foo(bar)` means
 *  those characters, which is the same choice `-F` makes on the server side. */
export function searchPattern(request: SearchRequest): RegExp {
  const source = request.regex ? request.query : request.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(source, wantsCaseSensitive(request) ? "" : "i");
}

/** The matching lines of one in-memory buffer, in the shape the disk search returns.
 *
 *  This exists because an unsaved buffer is invisible to ANY on-disk search — git, ripgrep or a
 *  hand-rolled scan alike — and the pane can have one. It is affordable precisely because there is
 *  at most one: `FilesPane` opens a single file, so this is never a scan of a project.
 *
 *  A query the user is still typing can be an invalid regex (`foo(`), which would throw on every
 *  keystroke until it is finished. That is a query with no matches yet, not an error to show. */
export function matchesInBuffer(path: string, text: string, request: SearchRequest): SearchMatch[] {
  let pattern: RegExp;
  try {
    pattern = searchPattern(request);
  } catch {
    return [];
  }
  const out: SearchMatch[] = [];
  text.split("\n").forEach((raw, index) => {
    if (out.length >= MAX_MATCHES_PER_FILE) return;
    const line = raw.replace(/\r$/, "");
    if (!pattern.test(line)) return;
    out.push({ path, line: index + 1, text: line.slice(0, MAX_SNIPPET_CHARS), clipped: line.length > MAX_SNIPPET_CHARS });
  });
  return out;
}

/**
 * Disk matches with the open buffer's own answer substituted for it.
 *
 * The trap this closes is the INVERSE of the obvious one. Missing a match in an unsaved file is a
 * loud failure — nothing appears. But a match found ON DISK in a file that is open and edited is a
 * QUIET one: the line number and the snippet describe the saved text, so the snippet shows
 * something not on screen and jumping lands in the wrong place.
 *
 * So the file's disk matches are dropped entirely and replaced by the buffer's, rather than merged:
 * the two describe different documents and there is no correspondence between their line numbers.
 */
export function withBufferMatches(diskMatches: SearchMatch[], buffer: { path: string; text: string } | null, request: SearchRequest): SearchMatch[] {
  if (!buffer) return diskMatches;
  return [...diskMatches.filter((match) => match.path !== buffer.path), ...matchesInBuffer(buffer.path, buffer.text, request)];
}
