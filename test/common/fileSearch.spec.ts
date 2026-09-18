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

  // The same escaping `-F` gives on the server side: someone searching for their own call site
  // means those characters, not a group.
  it("matches a literal query literally", () => {
    expect(matchesInBuffer("a.ts", "call foo(bar)\nfoobar\n", literal("foo(bar)"))).toHaveLength(1);
    expect(matchesInBuffer("a.ts", "call foo(bar)\nfoobar\n", { query: "foo(bar)", regex: true })).toEqual([
      { path: "a.ts", line: 2, text: "foobar", clipped: false },
    ]);
  });

  it("follows the same smart case the server does", () => {
    expect(matchesInBuffer("a.ts", "Session\n", literal("session"))).toHaveLength(1);
    expect(matchesInBuffer("a.ts", "Session\n", literal("Session"))).toHaveLength(1);
    expect(matchesInBuffer("a.ts", "session\n", literal("Session"))).toEqual([]);
  });

  // A query typed toward a regex passes through `foo(` on the way, and that throws. It is a query
  // with no matches yet, not an error to put in front of someone mid-keystroke.
  it("answers an unfinished regex with nothing rather than throwing", () => {
    expect(matchesInBuffer("a.ts", "foo(bar)\n", { query: "foo(", regex: true })).toEqual([]);
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
    expect(merged.filter((match) => match.path === "open.ts")).toEqual([{ path: "open.ts", line: 1, text: "fresh edit here", clipped: false }]);
    expect(merged).toContainEqual(otherFileMatch);
  });

  // A buffer whose edits removed the match must leave NOTHING for that file — keeping the disk hit
  // would point at a line the user has already deleted.
  it("drops the open file entirely when the buffer no longer matches", () => {
    const merged = withBufferMatches(disk, { path: "open.ts", text: "nothing to find\n" }, { query: "zzz", regex: false });
    expect(merged.map((match) => match.path)).toEqual(["other.ts"]);
  });

  // A file open but UNCHANGED is passed as no buffer at all, and then disk answers for everything.
  it("leaves the disk answer alone when no buffer is dirty", () => {
    expect(withBufferMatches(disk, null, request)).toEqual(disk);
  });

  // A dirty buffer the disk search found nothing in still contributes: it is the one file whose
  // content the search could not read.
  it("adds the buffer's matches even when the disk had none for it", () => {
    const merged = withBufferMatches([otherFileMatch], { path: "open.ts", text: "new text\n" }, { query: "new", regex: false });
    expect(merged.map((match) => match.path).sort()).toEqual(["open.ts", "other.ts"]);
  });
});
