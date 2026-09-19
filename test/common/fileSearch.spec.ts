// @vitest-environment node
//
// What a content search MEANS, for the two sides that decide it together (#2140). The server turns
// these into git's argv; the browser applies the same rules to the one file open with unsaved
// edits, which no on-disk search can see. A drift here would give that file a different notion of
// "case-insensitive" than every other file in the same result list.
import { describe, it, expect } from "vitest";
import {
  groupByFile,
  isSearchable,
  lineWindow,
  matchesInBuffer,
  MAX_MATCHES_PER_FILE,
  MAX_SNIPPET_CHARS,
  wantsCaseSensitive,
  withBufferMatches,
  type SearchMatch,
  type SearchRequest,
} from "../../common/fileSearch.js";

describe("wantsCaseSensitive", () => {
  it("is smart: all-lower matches either case, an upper-case letter means it", () => {
    expect(wantsCaseSensitive({ query: "session", regex: false })).toBe(false);
    expect(wantsCaseSensitive({ query: "sessionId", regex: false })).toBe(true);
    expect(wantsCaseSensitive({ query: "SESSION", regex: false })).toBe(true);
  });

  // A digit, a symbol and a CJK character are all "not upper case" and all leave it alone —
  // `toUpperCase() === toLowerCase()` is what tells a caseless character from a lower-case one.
  it("is not tricked into case sensitivity by caseless characters", () => {
    for (const query of ["123", "a-b_c", "日本語", "セッション", "→", "café"]) {
      expect(wantsCaseSensitive({ query, regex: false })).toBe(false);
    }
  });

  it("lets an explicit choice win over the guess", () => {
    expect(wantsCaseSensitive({ query: "lower", regex: false, caseSensitive: true })).toBe(true);
    expect(wantsCaseSensitive({ query: "Upper", regex: false, caseSensitive: false })).toBe(false);
  });
});

describe("isSearchable", () => {
  // Whitespace IS a query — someone looking for a tab or a trailing space means it. Only the empty
  // string is refused, because an empty pattern matches every line of every file.
  it("refuses only the empty query", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable(" ")).toBe(true);
    expect(isSearchable("\t")).toBe(true);
    expect(isSearchable("a")).toBe(true);
  });
});

describe("groupByFile", () => {
  it("orders files by code unit and lines within a file", () => {
    const grouped = groupByFile([
      { path: "b.ts", line: 9, text: "", clipped: false },
      { path: "a.ts", line: 30, text: "", clipped: false },
      { path: "a.ts", line: 4, text: "", clipped: false },
    ] satisfies SearchMatch[]);
    expect(grouped.map((group) => group.path)).toEqual(["a.ts", "b.ts"]);
    expect(grouped[0]?.matches.map((match) => match.line)).toEqual([4, 30]);
  });

  // Numeric, not lexical: line 30 after line 4 is the whole point, and a string sort would put
  // "30" first in every file with more than nine matches.
  it("sorts lines numerically", () => {
    const grouped = groupByFile([9, 10, 2, 100].map((line): SearchMatch => ({ path: "a.ts", line, text: "", clipped: false })));
    expect(grouped[0]?.matches.map((match) => match.line)).toEqual([2, 9, 10, 100]);
  });
});

describe("matchesInBuffer", () => {
  const literal = (query: string): SearchRequest => ({ query, regex: false });

  it("reports 1-based lines, as git and an editor both count", () => {
    expect(matchesInBuffer("a.ts", "one\nneedle\nthree\n", literal("needle"))).toEqual([{ path: "a.ts", line: 2, text: "needle", clipped: false }]);
  });

  // Literal means the characters, which is what someone searching for their own call site means —
  // and it is a plain string search, not a RegExp, so there is nothing here that can backtrack.
  it("matches a literal query literally, with no regex engine involved", () => {
    expect(matchesInBuffer("a.ts", "call foo(bar)\nfoobar\n", literal("foo(bar)"))).toEqual([{ path: "a.ts", line: 1, text: "call foo(bar)", clipped: false }]);
    // A query full of metacharacters is just characters: `.` does not match `x`.
    expect(matchesInBuffer("a.ts", "axc\n", literal("a.c"))).toEqual([]);
    expect(matchesInBuffer("a.ts", "a.c\n", literal("a.c"))).toHaveLength(1);
  });

  // The measurement behind the design, asserted so a future reader cannot reintroduce a RegExp
  // here without this going red: a pattern that would take a JS engine the better part of a minute
  // costs nothing, because it is never compiled.
  it("cannot be made slow by a query that is catastrophic as a regex", () => {
    const line = "a".repeat(40);
    const started = Date.now();
    expect(matchesInBuffer("a.ts", `${line}\n`, literal("(a+)+b"))).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("follows the same smart case the server does", () => {
    expect(matchesInBuffer("a.ts", "Session\n", literal("session"))).toHaveLength(1);
    expect(matchesInBuffer("a.ts", "Session\n", literal("Session"))).toHaveLength(1);
    expect(matchesInBuffer("a.ts", "session\n", literal("Session"))).toEqual([]);
  });

  it("obeys the same per-file cap and snippet cut", () => {
    const many = Array.from({ length: MAX_MATCHES_PER_FILE + 5 }, () => "hit").join("\n");
    expect(matchesInBuffer("a.ts", many, literal("hit"))).toHaveLength(MAX_MATCHES_PER_FILE);
    const long = `${"x".repeat(MAX_SNIPPET_CHARS + 20)}hit`;
    const [only] = matchesInBuffer("a.ts", long, literal("hit"));
    expect(only?.text).toHaveLength(MAX_SNIPPET_CHARS);
    expect(only?.clipped).toBe(true);
  });

  it("strips a trailing CR, as the disk path does", () => {
    expect(matchesInBuffer("a.ts", "needle\r\nsecond\r\n", literal("needle"))[0]?.text).toBe("needle");
  });
});

describe("withBufferMatches", () => {
  const openFileMatch: SearchMatch = { path: "open.ts", line: 42, text: "stale from disk", clipped: false };
  const otherFileMatch: SearchMatch = { path: "other.ts", line: 7, text: "untouched", clipped: false };
  const disk: SearchMatch[] = [openFileMatch, otherFileMatch];
  const request: SearchRequest = { query: "e", regex: false };

  // THE POINT. A disk hit in a file that is open and edited describes a document the user is not
  // looking at: its line number and snippet are from the saved text, so jumping lands in the wrong
  // place and the snippet shows something not on screen. Replaced wholesale, never merged — the two
  // documents have no line correspondence at all.
  it("replaces the open file's disk matches with the buffer's own", () => {
    const merged = withBufferMatches(disk, { path: "open.ts", text: "fresh edit here\n" }, request);
    expect(merged.matches.filter((match) => match.path === "open.ts")).toEqual([{ path: "open.ts", line: 1, text: "fresh edit here", clipped: false }]);
    expect(merged.matches).toContainEqual(otherFileMatch);
    expect(merged.bufferUnsearched).toBe(false);
  });

  // A buffer whose edits removed the match must leave NOTHING for that file — keeping the disk hit
  // would point at a line the user has already deleted.
  it("drops the open file entirely when the buffer no longer matches", () => {
    const merged = withBufferMatches(disk, { path: "open.ts", text: "nothing to find\n" }, { query: "zzz", regex: false });
    expect(merged.matches.map((match) => match.path)).toEqual(["other.ts"]);
  });

  // A file open but UNCHANGED is passed as no buffer at all, and then disk answers for everything.
  it("leaves the disk answer alone when no buffer is dirty", () => {
    expect(withBufferMatches(disk, null, request)).toEqual({ matches: disk, bufferUnsearched: false });
  });

  // A dirty buffer the disk search found nothing in still contributes: it is the one file whose
  // content the search could not read.
  it("adds the buffer's matches even when the disk had none for it", () => {
    const merged = withBufferMatches([otherFileMatch], { path: "open.ts", text: "new text\n" }, { query: "new", regex: false });
    expect(merged.matches.map((match) => match.path).sort()).toEqual(["open.ts", "other.ts"]);
  });

  // REGEX MODE DOES NOT SEARCH THE BUFFER. A pattern from the query would run on the thread that
  // draws the UI, and `(a+)+b` against a 32-character line takes the better part of a minute in a
  // JS engine — the tab would freeze, taking the unsaved buffer this exists to respect with it.
  //
  // The half that needs no matching still holds: the stale disk matches for that file are dropped
  // either way, so nothing points at a line number from a document the reader is not looking at.
  describe("in regex mode", () => {
    const asRegex: SearchRequest = { query: "fresh", regex: true };

    it("does not run the pattern over the buffer, and says the file went unsearched", () => {
      const merged = withBufferMatches(disk, { path: "open.ts", text: "fresh edit here\n" }, asRegex);
      expect(merged.bufferUnsearched).toBe(true);
      expect(merged.matches.map((match) => match.path)).toEqual(["other.ts"]);
    });

    it("still drops that file's stale disk matches — the quiet failure stays fixed", () => {
      const merged = withBufferMatches(disk, { path: "open.ts", text: "anything\n" }, asRegex);
      expect(merged.matches).not.toContainEqual(openFileMatch);
    });

    it("leaves every other file's matches alone", () => {
      expect(withBufferMatches(disk, { path: "open.ts", text: "x\n" }, asRegex).matches).toEqual([otherFileMatch]);
    });

    // Nothing is dirty, so nothing was skipped and the disk answer is whole.
    it("reports nothing unsearched when no buffer is dirty", () => {
      expect(withBufferMatches(disk, null, asRegex)).toEqual({ matches: disk, bufferUnsearched: false });
    });
  });
});

// The lines around a match (#2159). In `common/` because both sides run it — the server over a file
// it read from disk, the browser over the buffer being edited, whose surroundings are on no disk.
describe("lineWindow", () => {
  const text = "one\ntwo\nthree\nfour\nfive\n";

  it("takes the lines on both sides and says which number it starts at", () => {
    expect(lineWindow(text, 3, 1)).toEqual({
      from: 2,
      lines: [
        { text: "two", clipped: false },
        { text: "three", clipped: false },
        { text: "four", clipped: false },
      ],
    });
  });

  it("clamps at the top of the file rather than asking for line zero", () => {
    expect(lineWindow(text, 1, 2)).toEqual({
      from: 1,
      lines: [
        { text: "one", clipped: false },
        { text: "two", clipped: false },
        { text: "three", clipped: false },
      ],
    });
  });

  it("clamps at the bottom", () => {
    expect(lineWindow(text, 5, 2).lines.map((line) => line.text)).toEqual(["three", "four", "five"]);
  });

  // The trailing newline every well-formed text file ends with is a TERMINATOR, not a sixth line.
  // Counting it would put an empty row under the last match in every file.
  it("does not count the final newline as a line", () => {
    expect(lineWindow(text, 5, 0).lines).toEqual([{ text: "five", clipped: false }]);
    expect(lineWindow(text, 6, 0).lines).toEqual([]);
  });

  // ...but a blank line really is one, and only ONE trailing empty is dropped.
  it("keeps a genuine blank line", () => {
    expect(lineWindow("a\n\nc\n", 2, 0).lines).toEqual([{ text: "", clipped: false }]);
  });

  it("strips the carriage return a Windows file carries", () => {
    expect(lineWindow("a\r\nb\r\n", 1, 0).lines).toEqual([{ text: "a", clipped: false }]);
  });

  // A minified bundle is one line of a hundred thousand characters. Cut, and SAID to be cut — a
  // silently shortened line is indistinguishable from a short one.
  it("cuts a very long line and marks it", () => {
    const [only] = lineWindow(`${"x".repeat(MAX_SNIPPET_CHARS + 50)}\n`, 1, 0).lines;
    expect(only?.text).toHaveLength(MAX_SNIPPET_CHARS);
    expect(only?.clipped).toBe(true);
  });

  // The search answered before this read, so a file that shrank in between has no such line.
  //
  // ONE PAST THE END is the case that matters, and the only one that tests the rule: further out,
  // the window's own start has already overshot the file and it comes back empty whatever the rule
  // says — which is how the first version of this test passed against code with the rule removed.
  // At the boundary the window still overlaps real lines, and without the rule it returns the
  // file's tail: a neighbourhood that looks real around a match that is not there any more.
  it("answers with nothing for the line just past the end, not the file's tail", () => {
    expect(lineWindow(text, 6, 2).lines).toEqual([]);
  });

  it("answers with nothing well past the end too", () => {
    expect(lineWindow(text, 99, 2).lines).toEqual([]);
  });

  it("handles a file with no trailing newline at all", () => {
    expect(lineWindow("only", 1, 3)).toEqual({ from: 1, lines: [{ text: "only", clipped: false }] });
  });
});
