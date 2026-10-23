// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NARROW_AMBIGUOUS_FAMILY } from "../../common/terminalFontFamily.js";

// Personal-fork: every terminal's stack opens with this family, so the @font-face has to name it,
// or the stack asks for a face nobody declared and `①` is squeezed again with nothing failing.
const cssFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/style.css");

describe("the narrow face for the circled numbers", () => {
  it("is declared in src/style.css under the family the stack names, for those ranges only", () => {
    const css = readFileSync(cssFile, "utf8");
    const family = NARROW_AMBIGUOUS_FAMILY.slice(1, -1);
    const face = new RegExp(`@font-face\\s*{[^}]*font-family:\\s*"${family}"[^}]*}`).exec(css)?.[0] ?? "";
    expect(face).toContain('local("Consolas")');
    expect(face).toContain("unicode-range: U+2460-24FF, U+2776-277F");
  });
});
