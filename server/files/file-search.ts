// Handing a content search to `git grep`, and reading back what it says (#2140). No filesystem and
// no subprocess here: the route owns those, and every decision lives in a pure function so it can
// be tested over generated input.
//
// git is the engine for the reason `project-files.ts` gives for the file LIST — `.gitignore` is
// honoured by ASKING git, never by parsing it here, because a nested ignore file, `.git/info/exclude`,
// the user's global excludes and negation patterns all decide it. Content search needs the same
// authority, and one binary answers both a repository and a plain directory, so this needs no
// second engine and no new dependency.
//
// What a search MEANS — the request shape, smart case, the caps — is in `common/fileSearch.ts`,
// because the browser applies the same rules to the unsaved buffer.
import {
  MAX_MATCHES_PER_FILE,
  MAX_SEARCH_MATCHES,
  MAX_SNIPPET_CHARS,
  wantsCaseSensitive,
  type SearchMatch,
  type SearchRequest,
  type SearchResult,
} from "../../common/fileSearch.js";

/** Shorter than the shared git timeout: this runs while the user is typing. A repository too slow
 *  to answer inside it gives an empty result that says it is incomplete, not a hung panel. */
export const SEARCH_TIMEOUT_MS = 10_000;

/**
 * The argv for one search, minus the leading `git`.
 *
 * `-e <pattern>` rather than a bare pattern, and a trailing `--`: git's own synopsis is
 * `git grep [<options>] [-e] <pattern> [[--] <path>...]`, so `--` separates PATHS and a bare
 * pattern after it is ambiguous. `-e` says "this is the pattern" whatever it starts with, which is
 * what makes a query of `-i` or `--untracked` a search rather than a flag.
 *
 * `-z` because the default output is `path:line:text` and a path may contain a colon — measured on
 * `we:ird/c:d.ts`, which the colon form cannot be parsed back out of. With `-z` the path and the
 * line are NUL-terminated and only the text carries the newline.
 *
 * `-I` because without it a matching binary prints `Binary file … matches`, which is neither a line
 * nor something to open.
 *
 * `-m` asks for ONE MORE than will be shown. git's own cap would otherwise hide the truncation: it
 * stops at the limit, so the output of a file with exactly that many matches and of one with a
 * thousand are identical, and nothing downstream can tell them apart. The extra record is the
 * evidence, and it is dropped after it has been counted — the same reasoning `walkFiles` records
 * for its entry budget, where reading the counter reported a complete list as truncated.
 *
 * `--untracked` so a file the agent created seconds ago is searched — and it still skips a
 * `.gitignore`d one, which is the property this leans on rather than re-implementing.
 *
 * NEVER `--cached`. That searches the INDEX: a file edited and saved but not staged would be
 * answered from whenever it was last staged, and a word already deleted from disk would still be
 * reported. The default reads the working tree, which is also what makes the agent's own writes
 * visible the moment they land.
 */
export function searchArgv(request: SearchRequest, mode: SearchResult["source"]): string[] {
  const args = ["grep", "-z", "-n", "-I", `-m${MAX_MATCHES_PER_FILE + 1}`];
  if (mode === "no-index") args.push("--no-index");
  else args.push("--untracked");
  args.push(request.regex ? "-E" : "-F");
  if (!wantsCaseSensitive(request)) args.push("-i");
  return [...args, "-e", request.query, "--"];
}

/** Whether git ANSWERED the search — 0 for matches, 1 for none, and nothing else.
 *
 *  Read from the CODE and not from `ok`, because `git grep` exits 1 for "nothing matched", which is
 *  a complete and correct answer that `ok: false` cannot distinguish from a failure. Treating it as
 *  one turns an honest empty result into a second subprocess that re-searches ignoring
 *  `.gitignore`, and answers with `node_modules`.
 *
 *  Deliberately NOT called "is this a repository". It was, and the name was a lie: 128 means "git
 *  refused", which covers `fatal: not a git repository` AND
 *  `fatal: -e option, 'foo(': parentheses not balanced`, and the stderr that separates them is
 *  discarded by design. All this can say is that no answer came back — the caller decides what to
 *  do about it, and must not assume which cause it was.
 *
 *  Null is "the process never ran" (git missing, spawn refused, an argument execve will not take).
 *  It is not an answer either. */
export const answered = (code: number | null): boolean => code === 0 || code === 1;

/** Which mode a directory calls for. */
export type SearchMode = SearchResult["source"];

/**
 * The mode `git rev-parse --is-inside-work-tree` names — or NULL when it named none.
 *
 * Null is the whole point of this function. Writing the decision inline as
 * `probe.ok && probe.stdout === "true" ? "git" : "no-index"` reads correctly and collapses every
 * FAILURE of the probe into "no-index": a `rev-parse` that timed out, was killed, or never started
 * inside a real repository would then select the plain-directory mode, and the search would run
 * with `.gitignore` unapplied and answer with `node_modules`. That is the exact failure the mode
 * probe was introduced to eliminate, moved one subprocess earlier — and it survived the inversion
 * because inverting the rule is not enough if its DEFAULT still fails open.
 *
 * So the permitted set is stated instead: a mode comes only from an ANSWER.
 *
 *   exit 0, `true`   the directory is inside a work tree            -> repository mode
 *   exit 0, `false`  a bare repository, or inside `.git` — no tree  -> plain-directory mode
 *   any other exit   git ran and said this is not a repository      -> plain-directory mode
 *   NO exit status   the probe did not answer                       -> no mode; the caller refuses
 */
export function modeFromProbe(probe: { ok: boolean; stdout: string; code: number | null }): SearchMode | null {
  if (probe.code === null) return null;
  return probe.ok && probe.stdout.trim() === "true" ? "git" : "no-index";
}

/**
 * One record of `git grep -z -n`, read out of `stdout` starting at `from`.
 *
 * THE RECORD IS SCANNED, NOT SPLIT. The output is `path\0line\0text\n` repeated, and the first
 * version of this split the whole of stdout on `\n` before looking at the NULs — which fails for
 * the one thing `-z` was chosen to survive. A path may contain a NEWLINE: measured, git emits
 * `d/a\nb.txt\01\0needle here\n` for a file really called `d/a<LF>b.txt`. Splitting first threw
 * away `d/a` and accepted `b.txt` as the path, so the panel offered — and would have opened — a
 * file that does not exist, or a different one that does.
 *
 * Scanning is unambiguous because every field ends at something it cannot itself contain:
 *
 *   path   the first `\0`   a filename cannot hold NUL; the kernel forbids it
 *   line   the next `\0`    a decimal number holds neither NUL nor newline
 *   text   the next `\n`    it IS one line, and `-I` refused any file carrying a NUL
 *
 * Two different failures, told apart by whether the record's EXTENT is known:
 *
 *   both NULs present, contents bad   the record ends at the next newline, so it is SKIPPED and the
 *                                     scan continues — one unreadable line costs one match
 *   a NUL missing                     the record's extent is unknown, so the scan STOPS
 *
 * That last one is a truncated tail and nothing else: NULs appear only as field separators and
 * only in pairs, so an odd count means the output was cut off, and no NUL remains after it. Scanning
 * forward instead of stopping would therefore find nothing either — MEASURED, by mutating the break
 * into a one-character advance and watching every test stay green. The `break` is chosen because it
 * says what is true (there is nothing left to read), not because it prevents a wrong match; no
 * input git can produce distinguishes the two.
 */
function readRecord(stdout: string, from: number): { match: SearchMatch | null; next: number } | null {
  const pathEnd = stdout.indexOf("\0", from);
  if (pathEnd <= from) return null;
  const lineEnd = stdout.indexOf("\0", pathEnd + 1);
  if (lineEnd < 0) return null;
  const textEnd = stdout.indexOf("\n", lineEnd + 1);
  const end = textEnd < 0 ? stdout.length : textEnd;
  const line = Number(stdout.slice(pathEnd + 1, lineEnd));
  if (!Number.isInteger(line) || line <= 0) return { match: null, next: end + 1 };
  // `\r` only at the END of the matching text: a repository checked out on Windows carries one on
  // every line, and it would otherwise render as a stray character after every result.
  const raw = stdout.slice(lineEnd + 1, end).replace(/\r$/, "");
  return {
    match: { path: stdout.slice(from, pathEnd), line, text: raw.slice(0, MAX_SNIPPET_CHARS), clipped: raw.length > MAX_SNIPPET_CHARS },
    next: end + 1,
  };
}

/**
 * The matches in git's output, capped, with whether anything was left out.
 *
 * `truncated` is true when the TOTAL cap cut the list, when git itself stopped early
 * (`gitTruncated`), or when any file hit the per-file cap — the last is invisible from the array's
 * length, which is exactly why it is passed in rather than inferred.
 */
export function parseSearchOutput(stdout: string, gitTruncated = false): Omit<SearchResult, "source"> {
  const parsed: SearchMatch[] = [];
  let at = 0;
  while (at < stdout.length) {
    const record = readRecord(stdout, at);
    // Null is "the extent is unknown", not "the contents are bad" — see readRecord for why that can
    // only be a truncated tail, and why stopping and scanning on are indistinguishable there.
    if (!record) break;
    if (record.match) parsed.push(record.match);
    at = record.next;
  }
  const perFile = new Map<string, number>();
  let cappedAFile = false;
  const kept = parsed.filter((match) => {
    const seen = perFile.get(match.path) ?? 0;
    if (seen >= MAX_MATCHES_PER_FILE) {
      cappedAFile = true;
      return false;
    }
    perFile.set(match.path, seen + 1);
    return true;
  });
  return { matches: kept.slice(0, MAX_SEARCH_MATCHES), truncated: gitTruncated || cappedAFile || kept.length > MAX_SEARCH_MATCHES };
}
