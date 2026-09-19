// How a search result is DRAWN (#2159): where the query matched, whether the line has to be
// scrolled for the match to be visible, and what the list adds up to.
//
// These are the rules the panel was missing. It shipped rendering the head of every matching line,
// so a query whose match sat past the row's width produced a result with its own point cut off.
import { describe, it, expect } from "vitest";
import { literalMatchRanges, resultSummary, snippetView, splitAround } from "../../../src/components/searchResultView";
import type { SearchRequest } from "../../../common/fileSearch";

const literal = (query: string, caseSensitive?: boolean): SearchRequest => ({ query, regex: false, ...(caseSensitive === undefined ? {} : { caseSensitive }) });

/** What the parts render as, which is what the reader sees. */
const rendered = (parts: { text: string; hit: boolean }[]): string => parts.map((part) => part.text).join("");
/** Only the emphasised runs — what the eye is meant to land on. */
const hits = (parts: { text: string; hit: boolean }[]): string[] => parts.filter((part) => part.hit).map((part) => part.text);

describe("literalMatchRanges", () => {
  it("finds every occurrence, not only the first", () => {
    expect(literalMatchRanges("apply and apply again", literal("apply"))).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 15 },
    ]);
  });

  // `aa` starts twice in `aaa`. Two highlights would draw over each other and report a count the
  // reader cannot see.
  it("treats overlapping occurrences as one run", () => {
    expect(literalMatchRanges("aaa", literal("aa"))).toEqual([{ start: 0, end: 2 }]);
  });

  it("follows smart case: a lower-case query matches either case", () => {
    expect(literalMatchRanges("Session and session", literal("session"))).toHaveLength(2);
  });

  it("follows smart case: a query carrying an upper-case letter does not", () => {
    expect(literalMatchRanges("Session and session", literal("Session"))).toEqual([{ start: 0, end: 7 }]);
  });

  it("takes an explicit case override over the smart rule", () => {
    expect(literalMatchRanges("Session and session", literal("session", true))).toEqual([{ start: 12, end: 19 }]);
  });

  it("has nothing to say about a regex, where the position cannot be learned safely", () => {
    expect(literalMatchRanges("foobar", { query: "foo(bar)?", regex: true })).toEqual([]);
  });

  it("answers an empty query and an over-long one with nothing", () => {
    expect(literalMatchRanges("anything", literal(""))).toEqual([]);
    expect(literalMatchRanges("short", literal("much longer than the line"))).toEqual([]);
  });

  // The invariant that makes a disagreement with the server SAFE. Case folding can change a
  // string's length, so an index taken in a folded copy need not address the original — the failure
  // that would light up the wrong characters. Every range this returns must span exactly the query.
  it("never returns a range that is not the query's own length", () => {
    const lines = ["İstanbul and istanbul", "ǅungla ǆungla DŽungla", "straße STRASSE", "İİİ", "ﬁle ﬁle"];
    const queries = ["i", "İ", "ǆ", "ss", "ß", "ﬁ", "l"];
    const pairs = lines.flatMap((line) => queries.map((query) => ({ line, query })));
    pairs.forEach(({ line, query }) =>
      literalMatchRanges(line, literal(query)).forEach((range) => {
        expect(range.end - range.start).toBe(query.length);
        expect(range.end).toBeLessThanOrEqual(line.length);
      }),
    );
  });
});

describe("snippetView", () => {
  it("leaves a line whose match is already visible alone", () => {
    const view = snippetView("const needle = 1;", literal("needle"));
    expect(view.elided).toBe(false);
    expect(rendered(view.parts)).toBe("const needle = 1;");
    expect(hits(view.parts)).toEqual(["needle"]);
  });

  // THE ROW FROM THE SCREENSHOT. The match is at the end of the line, so the panel drew the head of
  // the line and cut the query away — a result showing everything except the thing found.
  it("scrolls the line so a match near its end is on screen", () => {
    const line = "#     (running attacker code with elevated permissions) doesn't apply.";
    const view = snippetView(line, literal("apply"));
    expect(view.elided).toBe(true);
    expect(rendered(view.parts)).toContain("apply");
    // And it kept some of what encloses the match rather than starting at it.
    expect(rendered(view.parts).indexOf("apply")).toBeGreaterThan(0);
    // What it dropped is the BEGINNING, so what remains is a tail of the original line.
    expect(line.endsWith(rendered(view.parts))).toBe(true);
  });

  it("still emphasises the match after scrolling to it", () => {
    const view = snippetView(`${"x".repeat(200)} needle here`, literal("needle"));
    expect(view.elided).toBe(true);
    expect(hits(view.parts)).toEqual(["needle"]);
  });

  // Regex mode, or a fold this cannot follow: the row renders exactly as it did before any of this
  // existed. A degradation, never a wrong position.
  it("renders the whole line unmarked when it knows of no match", () => {
    const view = snippetView("foobar plain", { query: "foo(bar)?", regex: true });
    expect(view.elided).toBe(false);
    expect(rendered(view.parts)).toBe("foobar plain");
    expect(hits(view.parts)).toEqual([]);
  });

  // The rule is "bring the match INSIDE the assumed row", not "put it near the left edge". A fixed
  // stub of lead threw away most of a row's width: the screenshot's line rendered as
  // `…ns) doesn't apply.` on a row with room for three times that.
  it("brings a match to the same column however far along the line it sits", () => {
    const columns = [60, 120, 300].map((pad) => {
      const shown = rendered(snippetView(`${"x".repeat(pad)} needle tail`, literal("needle")).parts);
      return shown.indexOf("needle") + "needle".length;
    });
    expect(new Set(columns).size).toBe(1);
  });

  it("keeps a real run of context before the match, not a stub", () => {
    const shown = rendered(snippetView(`${"lead ".repeat(40)}needle tail`, literal("needle")).parts);
    expect(shown.indexOf("needle")).toBeGreaterThan(20);
  });

  // A query longer than the assumed row cannot be brought inside it. Showing its BEGINNING is the
  // best available; cutting into it would render a match starting mid-way with no sign of it.
  it("never cuts into the match itself", () => {
    const query = "q".repeat(80);
    const shown = rendered(snippetView(`abcde ${query} tail`, literal(query)).parts);
    expect(shown).toContain(query);
  });

  it("keeps every character of what it shows", () => {
    const line = `${"lead ".repeat(30)}needle tail`;
    expect(line.endsWith(rendered(snippetView(line, literal("needle")).parts))).toBe(true);
  });
});

describe("resultSummary", () => {
  it("counts both, because either alone misleads", () => {
    expect(resultSummary(12, 8)).toBe("12 matches in 8 files");
  });

  it("says one of each without an s", () => {
    expect(resultSummary(1, 1)).toBe("1 match in 1 file");
  });
});

describe("splitAround", () => {
  const window = { from: 103, lines: [103, 104, 105, 106].map((n) => ({ text: `line ${n}`, clipped: false })) };

  it("puts the matched line in neither half — the row draws that one itself, highlighted", () => {
    const split = splitAround({ from: 103, lines: [103, 104, 105, 106, 107].map((n) => ({ text: `line ${n}`, clipped: false })) }, 105);
    expect(split.before.map((line) => line.line)).toEqual([103, 104]);
    expect(split.after.map((line) => line.line)).toEqual([106, 107]);
  });

  it("numbers each line from the window's own start", () => {
    expect(splitAround(window, 106).before.map((line) => line.text)).toEqual(["line 103", "line 104", "line 105"]);
    expect(splitAround(window, 106).before[0]?.line).toBe(103);
  });

  // The file changed between the search and the read, so the line it names is not in the window.
  // Everything lands on one side rather than one line being labelled as the match.
  it("does not invent a matched line when the window does not hold one", () => {
    const split = splitAround(window, 999);
    expect(split.before).toHaveLength(4);
    expect(split.after).toEqual([]);
  });

  it("carries the clipped flag through, so a cut context line is marked too", () => {
    const split = splitAround({ from: 1, lines: [{ text: "x", clipped: true }] }, 2);
    expect(split.before[0]?.clipped).toBe(true);
  });
});
