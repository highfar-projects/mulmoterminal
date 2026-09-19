// @vitest-environment node
//
// The two GIT-specific decisions behind content search (#2140): what argv `git grep` is handed, and
// how its output is read back. Both are pure, and both are where a mistake is silent — a wrong flag
// answers plausibly and a wrong parse drops results without erroring.
//
// What a search MEANS (smart case, an empty query, the grouping) is in test/common/fileSearch.spec.ts,
// beside the rules themselves.
import { describe, it, expect } from "vitest";
import { answered, modeFromProbe, parseSearchOutput, searchArgv } from "../../../server/files/file-search.js";
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

describe("answered", () => {
  // The distinction every caller of `git grep` rests on. Exit 1 is "nothing matched", which is a
  // COMPLETE answer; treating it as a failure is how a clean empty search became a second search
  // with .gitignore unapplied, answering with node_modules.
  it("counts 0 and 1 as answers, and nothing else", () => {
    expect(answered(0)).toBe(true); // matches
    expect(answered(1)).toBe(true); // no matches — a real answer
    expect(answered(128)).toBe(false); // git refused
    expect(answered(2)).toBe(false); // a real error
  });

  // It deliberately does NOT claim to know WHY git refused. 128 is `fatal: not a git repository`
  // and also `fatal: -e option, 'foo(': parentheses not balanced`, and the stderr that would
  // separate them is discarded by design — a predicate named for one of those causes was a lie,
  // and shipped an invalid regex to the reader as "nothing matched, and .gitignore is not applied".
  it("says nothing about WHICH refusal 128 was", () => {
    expect(answered(128)).toBe(false); // and the caller cannot learn WHICH refusal it was from this
  });

  // Null is "the process never ran" — git missing, spawn refused, an argument execve will not take.
  it("does not count a process that never ran", () => {
    expect(answered(null)).toBe(false);
  });
});

// The mode is ASKED, and this is the whole of the asking. It exists as a named function rather
// than an inline ternary because the inline form reads correctly and is wrong: it has to collapse
// every probe FAILURE into one of the two modes, and whichever one it picks is a guess made in the
// one case where nothing is known.
describe("modeFromProbe", () => {
  const probe = (code: number | null, stdout = "") => ({ ok: code === 0, stdout, code });

  it("takes repository mode only from git saying it is inside a work tree", () => {
    expect(modeFromProbe(probe(0, "true\n"))).toBe("git");
  });

  // A bare repository, or a directory inside `.git`: git answered, and the answer is that there is
  // no work tree — so there is no `.gitignore` to apply and plain-directory mode is the honest one.
  it("takes plain-directory mode from git saying there is no work tree", () => {
    expect(modeFromProbe(probe(0, "false\n"))).toBe("no-index");
  });

  it("takes plain-directory mode from git refusing — the ordinary not-a-repository case", () => {
    expect(modeFromProbe(probe(128))).toBe("no-index");
    expect(modeFromProbe(probe(1))).toBe("no-index");
  });

  // THE HOLE THE FIRST INVERSION STILL HAD. `code: null` is no exit status — timed out, killed,
  // cancelled, never spawned. Inline, it collapsed into "no-index", so a REAL repository whose
  // probe merely lost a race under load would be searched with `.gitignore` unapplied and answer
  // with `node_modules`: the exact failure the probe was introduced to eliminate, one call earlier.
  it("names NO mode when the probe produced no exit status", () => {
    expect(modeFromProbe(probe(null))).toBeNull();
    // Not even when the stdout happens to look like an answer — a killed process can have written
    // some of it before it died.
    expect(modeFromProbe(probe(null, "true\n"))).toBeNull();
  });

  // Whitespace only, because git's answer is a whole line. Anything else is not "true".
  it("reads the answer exactly", () => {
    expect(modeFromProbe(probe(0, "  true  "))).toBe("git");
    expect(modeFromProbe(probe(0, "truthy"))).toBe("no-index");
    expect(modeFromProbe(probe(0, ""))).toBe("no-index");
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

  // THE BUG THIS PARSER WAS REWRITTEN FOR. A filename may contain a NEWLINE, and `git grep -z`
  // emits it literally, BEFORE the first NUL. The previous parser split stdout on "\n" first, so it
  // threw away `d/a` and accepted `b.txt` as a path — the panel offered, and would have opened, a
  // file that does not exist, or a different one that does. Byte shape measured against real git.
  it("reads a path containing a newline, rather than inventing one from its tail", () => {
    const { matches } = parseSearchOutput(`d/a\nb.txt\x001\x00needle here\n${record("d/plain.txt", 1, "other needle")}\n`);
    expect(matches).toEqual([
      { path: "d/a\nb.txt", line: 1, text: "needle here", clipped: false },
      { path: "d/plain.txt", line: 1, text: "other needle", clipped: false },
    ]);
  });

  // A record whose EXTENT is known — both NULs present — can be skipped without guessing, so one
  // unreadable record costs one match and no more.
  it("skips a record with an unreadable line number and keeps the rest", () => {
    const { matches } = parseSearchOutput(`a.ts\x00notanumber\x00text\na.ts\x00-3\x00negative\n${record("ok.ts", 2, "kept")}\n`);
    expect(matches).toEqual([{ path: "ok.ts", line: 2, text: "kept", clipped: false }]);
  });

  // A truncated tail costs the tail and nothing else. This pins the OUTCOME, not the mechanism:
  // NULs appear only as separators and only in pairs, so an odd count means the output was cut off
  // and no NUL follows — scanning on instead of stopping finds nothing either. Measured by mutating
  // the stop into a one-character advance, which leaves every test here green. The implementation
  // stops because that is what is true, not because this test could tell the difference.
  it("keeps what it read before a truncated tail", () => {
    const { matches } = parseSearchOutput(`${record("ok.ts", 2, "kept")}\na.ts\x00only-one-nul-here`);
    expect(matches).toEqual([{ path: "ok.ts", line: 2, text: "kept", clipped: false }]);
  });

  it("answers an empty search with no matches and no truncation", () => {
    expect(parseSearchOutput("")).toEqual({ matches: [], truncated: false });
  });
});
