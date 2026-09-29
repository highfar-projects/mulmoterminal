// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  BLOCK_BUDGET_MS,
  DOCUMENT_BUDGET_MS,
  fenceColourer,
  fenceLanguage,
  highlightedCode,
  highlightedFence,
  MAX_HIGHLIGHT_CHARS,
} from "../../../server/files/codeHighlight";

// #2579. A fence in the Preview is coloured on the server with the editor's own grammars.

describe("fenceLanguage", () => {
  it.each([
    ["ts", "ts"],
    ["TS", "ts"],
    ['ts title="a.ts"', "ts"],
    ["  python  ", "python"],
    ["", ""],
    [undefined, ""],
  ])("reads %j as %j", (lang, expected) => {
    expect(fenceLanguage(lang)).toBe(expected);
  });
});

describe("highlightedCode", () => {
  it("marks each token with the class the palette colours", () => {
    const html = highlightedCode("const a = 1; // note", "ts") ?? "";
    expect(html).toContain('<span class="tok-keyword">const</span>');
    expect(html).toContain('<span class="tok-number">1</span>');
    expect(html).toContain('<span class="tok-comment">// note</span>');
  });

  it.each([
    ["python", "def f():\n    return 1", "tok-keyword"],
    ["json", '{"a": true}', "tok-bool"],
    ["css", "a { color: red; }", "tok-propertyName"],
    ["rust", "fn main() {}", "tok-keyword"],
    ["sql", "SELECT 1", "tok-keyword"],
    ["php", "$a = 1;\nfunction f() { return 2; }", "tok-keyword"],
  ])("colours %s", (lang, code, token) => {
    expect(highlightedCode(code, lang)).toContain(token);
  });

  // The text is the file's, never markup: a fence showing HTML must show it, not render it.
  it("escapes the code", () => {
    const html = highlightedCode('const s = "<img src=x onerror=alert(1)>";', "js") ?? "";
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps every character and line of the code", () => {
    const code = "a = 1\n\nb = 'x & y'\n";
    // Strip the markup by splitting on the tag delimiters: the text between `>` and `<` is the code.
    const withoutTags = (highlightedCode(code, "py") ?? "")
      .split("<")
      .map((part, index) => (index === 0 ? part : part.slice(part.indexOf(">") + 1)))
      .join("");
    const text = withoutTags.replaceAll("&amp;", "&").replaceAll("&#39;", "'");
    expect(text).toBe(code);
  });

  // `constructor` and `__proto__` are names on every object; a fence labelled with one must not find a
  // "grammar" there and throw, which failed the whole document.
  it.each([["sh"], ["unknown"], [""], [undefined], ["constructor"], ["__proto__"], ["toString"], ["hasOwnProperty"]])(
    "leaves a fence in %j to marked",
    (lang) => {
      expect(highlightedCode("echo hi", lang)).toBeNull();
    },
  );

  it("leaves a block past the cap to marked", () => {
    expect(highlightedCode("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "js")).toBeNull();
    expect(highlightedCode("x".repeat(MAX_HIGHLIGHT_CHARS), "js")).not.toBeNull();
  });
});

describe("highlightedFence", () => {
  it("names the language as marked does", () => {
    expect(highlightedFence("1", "JS")).toMatch(/^<pre><code class="language-JS">/);
  });

  it("is null where highlightedCode is", () => {
    expect(highlightedFence("echo", "sh")).toBeNull();
  });
});

// A block can be built to be pathological for its grammar: minutes of parsing and gigabytes of heap,
// on the thread every terminal shares. Parsing is stepped and given up when its time is spent.
describe("the parse budget", () => {
  /** A clock that moves on by `step` milliseconds each time it is read. */
  const ticking = (step: number) => {
    let t = 0;
    return () => (t += step);
  };

  it("shows a block plain once its time is spent", () => {
    const hostile = "<a ".repeat(20_000);
    expect(highlightedCode(hostile, "xml", 50, ticking(10))).toBeNull();
  });

  it("colours a block that finishes in time", () => {
    expect(highlightedCode("const a = 1;", "ts", 1_000_000, ticking(1))).toContain("tok-keyword");
  });

  // A deep enough nesting overflows the stack in the grammar or the highlighter; the document still
  // renders, with that block plain.
  it.each([
    ["md", "> ".repeat(10_000)],
    ["yaml", "- ".repeat(5_000)],
  ])("does not throw on a %s block nested too deep", (lang, code) => {
    expect(() => highlightedCode(code, lang)).not.toThrow();
  });

  it("gives each block its share and the document no more than its total", () => {
    const now = ticking(1);
    const colour = fenceColourer(now);
    const results = Array.from({ length: DOCUMENT_BUDGET_MS }, () => colour("const a = 1;", "ts"));
    expect(results[0]).toContain("tok-keyword");
    expect(results.at(-1)).toBeNull();
  });

  it("keeps a real block well inside the budget", () => {
    const code = "export function f(a: number): number {\n  return a * 2; // double\n}\n".repeat(2_000);
    const start = performance.now();
    expect(fenceColourer()(code, "ts")).toContain("tok-keyword");
    expect(performance.now() - start).toBeLessThan(BLOCK_BUDGET_MS * 20);
  });
});
