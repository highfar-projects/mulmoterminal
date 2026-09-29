// @vitest-environment node
import { describe, it, expect } from "vitest";
import { fenceLanguage, highlightedCode, renderedFence, MAX_HIGHLIGHT_CHARS } from "../../../server/files/codeHighlight";

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

  it.each([["sh"], ["unknown"], [""], [undefined]])("leaves a fence in %j to marked", (lang) => {
    expect(highlightedCode("echo hi", lang)).toBeNull();
  });

  it("leaves a block past the cap to marked", () => {
    expect(highlightedCode("x".repeat(MAX_HIGHLIGHT_CHARS + 1), "js")).toBeNull();
    expect(highlightedCode("x".repeat(MAX_HIGHLIGHT_CHARS), "js")).not.toBeNull();
  });
});

describe("renderedFence", () => {
  it("names the language as marked does", () => {
    expect(renderedFence("1", "JS", null)).toMatch(/^<pre><code class="language-JS">/);
  });

  // The new-tab document runs no script, so an uncoloured block stays marked's.
  it("leaves an uncoloured block to marked when there is no tag", () => {
    expect(renderedFence("echo", "sh", null)).toBeNull();
  });

  // The Preview copies only from a block the server tagged: every fence is drawn here then, coloured
  // or not, so each carries the tag.
  it.each([
    ["a coloured block", "const a = 1;", "ts", '<code class="language-ts"><span class="tok-keyword">const</span>'],
    ["a block with no grammar", "echo <hi>", "sh", '<code class="language-sh">echo &lt;hi&gt;</code>'],
    ["a block with no language", "plain", undefined, "<pre><code>plain</code></pre>"],
  ])("tags %s", (_case, code, lang, inner) => {
    const html = renderedFence(code, lang, "N0nce") ?? "";
    expect(html.startsWith('<div class="mt-block" data-mt-fence="N0nce">')).toBe(true);
    expect(html).toContain(inner);
  });

  it("escapes the tag", () => {
    expect(renderedFence("a", "js", 'x"y')).toContain('data-mt-fence="x&quot;y"');
  });
});
