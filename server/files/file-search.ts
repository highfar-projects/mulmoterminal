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

/** Whether git's exit status means "this directory is not a repository", which is the only outcome
 *  that should be retried in `--no-index` mode.
 *
 *  Told apart by the CODE and not by `ok`, because `git grep` exits 1 for "nothing matched" — a
 *  complete and correct answer — and both land as `ok: false` with empty output. Retrying on the
 *  wrong one turns an honest empty result into a second subprocess that re-searches the same
 *  directory ignoring `.gitignore`, and answers with `node_modules`. */
export const isNotARepository = (code: number | null): boolean => code !== null && code !== 0 && code !== 1;

/** One record of `git grep -z -n`: `path\0line\0text`, records separated by newline.
 *
 * The text is the only field that can hold a `:` or a NUL-free surprise, and it is last, so the two
 * NULs are found from the LEFT and everything after the second one is the line — a text containing
 * a NUL cannot happen, because `-I` refused the file that would carry one.
 */
function parseRecord(record: string): SearchMatch | null {
  const firstNul = record.indexOf("\0");
  if (firstNul <= 0) return null;
  const secondNul = record.indexOf("\0", firstNul + 1);
  if (secondNul < 0) return null;
  const line = Number(record.slice(firstNul + 1, secondNul));
  if (!Number.isInteger(line) || line <= 0) return null;
  const raw = record.slice(secondNul + 1);
  return {
    path: record.slice(0, firstNul),
    line,
    text: raw.slice(0, MAX_SNIPPET_CHARS),
    clipped: raw.length > MAX_SNIPPET_CHARS,
  };
}

/**
 * The matches in git's output, capped, with whether anything was left out.
 *
 * `\r\n` is stripped from the end of a line before the snippet is cut: a repository checked out on
 * Windows carries one on every line, and it would otherwise render as a stray character at the end
 * of every result.
 *
 * `truncated` is true when the TOTAL cap cut the list, when git itself stopped early
 * (`gitTruncated`), or when any file hit the per-file cap — the last is invisible from the array's
 * length, which is exactly why it is passed in rather than inferred.
 */
export function parseSearchOutput(stdout: string, gitTruncated = false): Omit<SearchResult, "source"> {
  const records = stdout.split("\n").filter((record) => record !== "");
  const parsed = records.flatMap((record) => {
    const match = parseRecord(record.replace(/\r$/, ""));
    return match ? [match] : [];
  });
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
