// @vitest-environment node
//
// The two GIT-specific decisions behind content search (#2140): what argv `git grep` is handed, and
// how its output is read back. Both are pure, and both are where a mistake is silent — a wrong flag
// answers plausibly and a wrong parse drops results without erroring.
//
// What a search MEANS (smart case, an empty query, the grouping) is in test/common/fileSearch.spec.ts,
// beside the rules themselves.
import { describe, it, expect } from "vitest";
import { isNotARepository, parseSearchOutput, searchArgv } from "../../../server/files/file-search.js";
import { MAX_MATCHES_PER_FILE, MAX_SEARCH_MATCHES, MAX_SNIPPET_CHARS } from "../../../common/fileSearch.js";

const record = (path: string, line: number, text: string): string => `${path}\0${line}\0${text}`;

describe("searchArgv", () => {
  // The flag whose absence is a correctness bug rather than a missing feature: `--cached` searches
  // the INDEX, so an edited-but-unstaged file would answer from whenever it was last staged and a
  // word already deleted from disk would still be reported. Asserted as a NEGATIVE because that is
  // the direction the mistake comes from — someone adding it for speed.
  it("never asks git for the index", () => {
    for (const mode of ["git", "no-index"] as const) {
      expect(searchArgv({ query: "x", regex: false }, mode)).not.toContain("--cached");
    }
  });

  // `--` alone separates PATHS, so a bare pattern after it is ambiguous; `-e` says "this is the
  // pattern" whatever it starts with. Without it a query of `-i` or `--untracked` is read as a flag.
  it("passes the query as -e, so a query that looks like a flag is still a query", () => {
    const argv = searchArgv({ query: "--untracked", regex: false }, "git");
    const at = argv.indexOf("-e");
    expect(at).toBeGreaterThan(-1);
    expect(argv[at + 1]).toBe("--untracked");
    expect(argv[argv.length - 1]).toBe("--");
  });

  it("searches untracked files in a repository and uses --no-index outside one", () => {
    expect(searchArgv({ query: "x", regex: false }, "git")).toContain("--untracked");
    expect(searchArgv({ query: "x", regex: false }, "git")).not.toContain("--no-index");
    expect(searchArgv({ query: "x", regex: false }, "no-index")).toContain("--no-index");
    expect(searchArgv({ query: "x", regex: false }, "no-index")).not.toContain("--untracked");
  });

  // -z: a path may contain a colon, which the default `path:line:text` cannot be parsed back out of.
  // -I: a matching binary otherwise prints "Binary file … matches", which is not a line to open.
  it("asks for NUL-separated output and skips binaries", () => {
    const argv = searchArgv({ query: "x", regex: false }, "git");
    expect(argv).toContain("-z");
    expect(argv).toContain("-n");
    expect(argv).toContain("-I");
    // One MORE than is shown, on purpose: git's cap would otherwise make "exactly at the limit"
    // and "far past it" produce identical output, and the truncation could not be reported.
    expect(argv).toContain(`-m${MAX_MATCHES_PER_FILE + 1}`);
  });

  it("picks fixed-string or regex matching", () => {
    expect(searchArgv({ query: "a(b)", regex: false }, "git")).toContain("-F");
    expect(searchArgv({ query: "a(b)", regex: true }, "git")).toContain("-E");
    expect(searchArgv({ query: "a(b)", regex: true }, "git")).not.toContain("-F");
  });

  it("adds -i exactly when the search is case-insensitive", () => {
    expect(searchArgv({ query: "lower", regex: false }, "git")).toContain("-i");
    expect(searchArgv({ query: "Upper", regex: false }, "git")).not.toContain("-i");
    expect(searchArgv({ query: "lower", regex: false, caseSensitive: true }, "git")).not.toContain("-i");
  });
});

describe("isNotARepository", () => {
  // The distinction the whole fallback rests on. `git grep` exits 1 for "nothing matched", which is
  // a COMPLETE answer; retrying that in --no-index mode re-searches with .gitignore unapplied and
  // answers a clean "no results" with node_modules.
  it("separates 'nothing matched' from 'not a repository'", () => {
    expect(isNotARepository(0)).toBe(false); // matches
    expect(isNotARepository(1)).toBe(false); // no matches — a real answer
    expect(isNotARepository(128)).toBe(true); // not a repository
    expect(isNotARepository(2)).toBe(true); // a real error
  });

  // Null is "the process never ran" (git missing, spawn refused). Retrying in the other mode is
  // right there: it costs one more failed spawn and covers a git that cannot read this directory.
  it("treats a process that never ran as worth retrying", () => {
    expect(isNotARepository(null)).toBe(false);
  });
});

describe("parseSearchOutput", () => {
  it("reads path, line and text out of NUL-separated records", () => {
    const { matches, truncated } = parseSearchOutput(`${record("a.ts", 1, "alpha")}\n${record("b/c.ts", 42, "beta")}\n`);
    expect(matches).toEqual([
      { path: "a.ts", line: 1, text: "alpha", clipped: false },
      { path: "b/c.ts", line: 42, text: "beta", clipped: false },
    ]);
    expect(truncated).toBe(false);
  });

  // The reason for -z, asserted from the parse side: both the path and the matching text hold
  // colons, and the default `path:line:text` form cannot be taken apart again.
  it("survives a colon in the path and in the text", () => {
    const { matches } = parseSearchOutput(`${record("we:ird/c:d.ts", 7, "key: value: more")}\n`);
    expect(matches).toEqual([{ path: "we:ird/c:d.ts", line: 7, text: "key: value: more", clipped: false }]);
  });

  // A repository checked out on Windows carries \r on every line; without stripping it, every
  // result renders with a stray character at the end.
  it("strips a trailing CR", () => {
    const { matches } = parseSearchOutput(`${record("a.ts", 1, "windows line\r")}\n`);
    expect(matches[0]?.text).toBe("windows line");
  });

  it("cuts a long line and says it did", () => {
    const long = "x".repeat(MAX_SNIPPET_CHARS + 50);
    const { matches } = parseSearchOutput(`${record("min.js", 1, long)}\n`);
    expect(matches[0]?.text).toHaveLength(MAX_SNIPPET_CHARS);
    expect(matches[0]?.clipped).toBe(true);
  });

  // The per-file cap is the one truncation the array's own length cannot reveal, which is why the
  // flag is computed rather than left to the caller to infer.
  it("caps one file's share and reports the truncation", () => {
    const many = Array.from({ length: MAX_MATCHES_PER_FILE + 5 }, (_, i) => record("big.ts", i + 1, "hit")).join("\n");
    const { matches, truncated } = parseSearchOutput(`${many}\n`);
    expect(matches).toHaveLength(MAX_MATCHES_PER_FILE);
    expect(truncated).toBe(true);
  });

  it("caps the total and reports that too", () => {
    const files = MAX_SEARCH_MATCHES / MAX_MATCHES_PER_FILE + 2;
    const lines: string[] = [];
    for (let file = 0; file < files; file += 1) {
      for (let line = 1; line <= MAX_MATCHES_PER_FILE; line += 1) lines.push(record(`f${file}.ts`, line, "hit"));
    }
    const { matches, truncated } = parseSearchOutput(`${lines.join("\n")}\n`);
    expect(matches).toHaveLength(MAX_SEARCH_MATCHES);
    expect(truncated).toBe(true);
  });

  it("carries git's own early stop through", () => {
    expect(parseSearchOutput("", true).truncated).toBe(true);
    expect(parseSearchOutput("", false).truncated).toBe(false);
  });

  // Malformed records are dropped rather than throwing: this is stdout from a subprocess, and one
  // unreadable record must not cost the whole search.
  it("drops a record it cannot read, keeping the rest", () => {
    const { matches } = parseSearchOutput(
      ["no-nuls-at-all", `a.ts\0notanumber\0text`, `\0 1\0leading nul`, `a.ts\0-3\0negative`, record("ok.ts", 2, "kept")].join("\n"),
    );
    expect(matches).toEqual([{ path: "ok.ts", line: 2, text: "kept", clipped: false }]);
  });

  it("answers an empty search with no matches and no truncation", () => {
    expect(parseSearchOutput("")).toEqual({ matches: [], truncated: false });
  });
});
