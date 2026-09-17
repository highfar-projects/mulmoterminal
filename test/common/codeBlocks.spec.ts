import { describe, it, expect } from "vitest";
import { fencedBlocks, lastFencedBlock, markdownSegments } from "../../common/codeBlocks";

// #865. The value of this feature is that what lands on the clipboard is byte-for-byte what the
// agent wrote — so the cases that matter are the ones where a naive split would quietly change
// it: indentation inside the block, a fence character appearing in the content, a block that
// was never closed.
const md = (...lines: string[]) => lines.join("\n");

describe("fencedBlocks", () => {
  it("returns the body verbatim, including blank lines and indentation", () => {
    const body = md("function f() {", "  return 1;", "", "}");
    expect(fencedBlocks(md("prose", "```ts", body, "```", "more prose"))).toEqual([{ lang: "ts", body }]);
  });

  it("reads the language from the info string, lower-cased, ignoring the rest of the line", () => {
    expect(fencedBlocks(md("```TS title=foo.ts", "x", "```"))[0].lang).toBe("ts");
  });

  it("reports no language when the fence carries none", () => {
    expect(fencedBlocks(md("```", "x", "```"))[0].lang).toBeNull();
  });

  it("finds every block, in order", () => {
    expect(fencedBlocks(md("```", "one", "```", "text", "```", "two", "```")).map((b) => b.body)).toEqual(["one", "two"]);
  });

  it("accepts ~~~ as a fence", () => {
    expect(fencedBlocks(md("~~~bash", "echo hi", "~~~"))).toEqual([{ lang: "bash", body: "echo hi" }]);
  });

  // The reason the closer has to match the OPENER rather than any fence: a shell snippet that
  // itself contains ``` is ordinary in this app's output, and cutting the block there would hand
  // over half a command.
  it("does not close a ~~~~ block on a ``` inside it", () => {
    const body = md("run this:", "```", "ls -la", "```");
    expect(fencedBlocks(md("~~~~", body, "~~~~"))).toEqual([{ lang: null, body }]);
  });

  it("does not close a longer fence on a shorter one of the same character", () => {
    const body = md("```", "nested", "```");
    expect(fencedBlocks(md("````", body, "````"))[0].body).toBe(body);
  });

  it("closes on a longer run of the same character", () => {
    expect(fencedBlocks(md("```", "x", "`````"))[0].body).toBe("x");
  });

  // A closing fence may carry no info string. A line like ```js is therefore CONTENT of the
  // open block, not its end — which is what keeps a reply that quotes markdown (a fenced block
  // showing another fenced block) from being cut at the inner one.
  it("does not close on a fence that carries an info string", () => {
    expect(fencedBlocks(md("```", "x", "```js", "y", "```"))).toEqual([{ lang: null, body: md("x", "```js", "y") }]);
  });

  it("tolerates trailing whitespace on the closing fence", () => {
    expect(fencedBlocks(md("```", "x", "```   "))[0].body).toBe("x");
  });

  it("accepts a fence indented up to three spaces", () => {
    expect(fencedBlocks(md("   ```", "x", "   ```"))[0].body).toBe("x");
  });

  // An agent cut off mid-block is precisely when someone reaches for this; returning nothing
  // would read as "there is no code in that reply".
  it("returns an unclosed block, running to the end", () => {
    expect(fencedBlocks(md("```py", "print(1)", "print(2)"))).toEqual([{ lang: "py", body: md("print(1)", "print(2)") }]);
  });

  it.each([
    ["no fences at all", "just prose"],
    ["an empty string", ""],
  ])("returns nothing for %s", (_case, input) => {
    expect(fencedBlocks(input)).toEqual([]);
  });

  it("returns an empty body for an empty block rather than dropping it", () => {
    expect(fencedBlocks(md("```", "```"))).toEqual([{ lang: null, body: "" }]);
  });
});

describe("lastFencedBlock", () => {
  it("takes the last block — what 'the code you just gave me' means", () => {
    expect(lastFencedBlock(md("```", "first", "```", "```", "second", "```"))?.body).toBe("second");
  });

  // An empty clipboard is indistinguishable from a copy that failed, so an empty trailing block
  // must not win over a real one above it.
  it("skips a trailing empty block in favour of the last real one", () => {
    expect(lastFencedBlock(md("```", "real", "```", "```", "   ", "```"))?.body).toBe("real");
  });

  it.each([
    ["a reply with no code", "no code here"],
    ["only empty blocks", md("```", "```")],
  ])("returns null for %s", (_case, input) => {
    expect(lastFencedBlock(input)).toBeNull();
  });
});

// #2112. `markdownSegments` is the one walk over the fences and `fencedBlocks` is it with the prose
// dropped, which is why the cases above still stand as they are. (It was added for the transcript
// pane, which now renders the whole reply as markdown instead; the walk stayed because it is what
// removed the second fence scanner.)
describe("markdownSegments", () => {
  it("keeps prose and code in the order they appear", () => {
    expect(markdownSegments(md("before", "```ts", "code()", "```", "after"))).toEqual([
      { kind: "text", text: "before" },
      { kind: "code", lang: "ts", body: "code()" },
      { kind: "text", text: "after" },
    ]);
  });

  it("keeps a prose run's own blank lines, and joins it as one segment", () => {
    expect(markdownSegments(md("one", "", "two"))).toEqual([{ kind: "text", text: md("one", "", "two") }]);
  });

  it("emits no empty prose segment when the text opens or closes on a fence", () => {
    expect(markdownSegments(md("```", "x", "```")).map((s) => s.kind)).toEqual(["code"]);
  });

  it("carries an unclosed block to the end, like fencedBlocks", () => {
    expect(markdownSegments(md("prose", "```", "tail"))).toEqual([
      { kind: "text", text: "prose" },
      { kind: "code", lang: null, body: "tail" },
    ]);
  });

  it("treats a shorter fence inside a longer one as content", () => {
    expect(markdownSegments(md("~~~~", "```", "x", "```", "~~~~"))).toEqual([{ kind: "code", lang: null, body: md("```", "x", "```") }]);
  });

  it("is the one walk: fencedBlocks is its code segments", () => {
    const text = md("a", "```js", "1", "```", "b", "~~~", "2", "~~~", "c");
    const fromSegments = markdownSegments(text).flatMap((s) => (s.kind === "code" ? [{ lang: s.lang, body: s.body }] : []));
    expect(fencedBlocks(text)).toEqual(fromSegments);
  });
});

// The generated half of the differential harness that moved `fencedBlocks` onto `markdownSegments`.
// The harness itself could not survive — half of it was the code being replaced — so what is kept is
// the generator (which line shapes matter here) and the property that the old implementation's
// structure states independently: PROSE IS EVERY LINE OUTSIDE A BLOCK'S CONSUMED RANGE.
//
// Written as consumed ranges rather than as an accumulate-and-flush, deliberately: the same
// formulation as the code under test would agree with it by construction and prove nothing.
//
// The seed is fixed and printed by the assertion message, so a failure here is reproducible rather
// than "it went red once".
const LINE_SHAPES = [
  "",
  " ",
  "hello world",
  "  indented prose",
  "    four spaces is not a fence",
  "`inline`",
  "``two``",
  "text with ``` inside",
  "```",
  "```ts",
  "``` ts extra words",
  "   ```",
  "    ```",
  "````",
  "~~~",
  "~~~bash",
  "~~~~",
  "   ~~~ ",
  "```   ",
  "日本語の行",
];

const SEED = 20260917;

/** Every line that no fenced block consumed, grouped into the runs they form. Reads the fences
 *  through `fencedBlocks` boundaries rather than re-deriving them: a block's consumed range is its
 *  opener, its body, and its closer when one is there. */
const proseRunsOutsideBlocks = (text: string): string[] => {
  const lines = text.split("\n");
  const fence = (line: string): string | null => {
    const at = line.search(/[^ ]/);
    if (at < 0 || at > 3) return null;
    const char = line[at];
    if (char !== "`" && char !== "~") return null;
    const run = line.slice(at).match(char === "`" ? /^`+/ : /^~+/)?.[0] ?? "";
    return run.length >= 3 ? run : null;
  };
  const consumed = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const opener = line === undefined ? null : fence(line);
    if (opener === null) {
      i++;
      continue;
    }
    consumed.add(i);
    i++;
    for (let next = lines[i]; next !== undefined; next = lines[i]) {
      const closer = fence(next);
      if (closer !== null && closer[0] === opener[0] && closer.length >= opener.length && next.trim() === closer) break;
      consumed.add(i);
      i++;
    }
    if (i < lines.length) consumed.add(i);
    i++;
  }
  const runs: string[] = [];
  let run: string[] = [];
  lines.forEach((line, at) => {
    if (consumed.has(at)) {
      if (run.length > 0) runs.push(run.join("\n"));
      run = [];
      return;
    }
    run.push(line);
  });
  if (run.length > 0) runs.push(run.join("\n"));
  return runs;
};

describe("markdownSegments over generated documents", () => {
  it("loses no prose line, and keeps every run in order", () => {
    let seed = SEED;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 2000; run++) {
      const lines: string[] = [];
      const count = Math.floor(next() * 13);
      for (let i = 0; i < count; i++) lines.push(LINE_SHAPES[Math.floor(next() * LINE_SHAPES.length)] ?? "");
      const text = lines.join("\n");
      const prose = markdownSegments(text).flatMap((s) => (s.kind === "text" ? [s.text] : []));
      expect(prose, `seed ${SEED}, document ${JSON.stringify(text)}`).toEqual(proseRunsOutsideBlocks(text));
    }
  });
});
