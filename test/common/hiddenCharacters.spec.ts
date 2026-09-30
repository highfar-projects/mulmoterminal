import { describe, it, expect } from "vitest";
import { isHiddenCharacter, revealHidden } from "../../common/hiddenCharacters";

// #2615. What a text box does not show as itself, written out before a block is copied.
describe("revealHidden", () => {
  it("leaves ordinary code, tabs and line endings as they are", () => {
    const text = 'const a = "x";\r\n\tif (a) {}\n日本語 é';
    expect(revealHidden(text)).toEqual({ shown: text, hidden: 0 });
  });

  it.each([
    ["\u202E", "<U+202E>"],
    ["\u2066", "<U+2066>"],
    ["\u200B", "<U+200B>"],
    ["\uFEFF", "<U+FEFF>"],
    ["\u001B[201~", "<U+001B>[201~"],
    ["\u0001\u0004", "<U+0001><U+0004>"],
    ["\u0085", "<U+0085>"],
    ["\u{E0041}", "<U+E0041>"],
  ])("writes %j out as %j", (text, shown) => {
    expect(revealHidden(text).shown).toBe(shown);
    expect(revealHidden(text).hidden).toBe([...text].filter((c) => isHiddenCharacter(c.codePointAt(0) ?? 0)).length);
  });

  it("counts each one", () => {
    expect(revealHidden("a\u202Eb\u202Cc\u0000").hidden).toBe(3);
  });

  it("copes with empty text and a lone surrogate", () => {
    expect(revealHidden("")).toEqual({ shown: "", hidden: 0 });
    expect(revealHidden("\uD800x").shown).toBe("\uD800x");
  });
});
