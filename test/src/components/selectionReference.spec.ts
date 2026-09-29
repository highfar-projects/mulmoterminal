import { describe, it, expect } from "vitest";
import { selectionReference } from "../../../src/components/selectionReference";

// #2575. What the pane types at the prompt for "these lines".
describe("selectionReference", () => {
  const base = { pathRel: "src/a.ts", cwd: "/proj", terminalCwd: "/proj" };

  it.each([
    [{ from: 10, to: 20 }, "@src/a.ts#L10-20 "],
    [{ from: 7, to: 7 }, "@src/a.ts#L7 "],
    [null, "@src/a.ts "],
  ])("names %j", (lines, text) => {
    expect(selectionReference({ ...base, lines })).toBe(text);
  });

  // A relative path only where it names the same file at the terminal's end.
  it("uses the absolute path when the terminal is in another directory", () => {
    expect(selectionReference({ ...base, terminalCwd: "/other", lines: { from: 1, to: 2 } })).toBe("@/proj/src/a.ts#L1-2 ");
    expect(selectionReference({ ...base, terminalCwd: null, lines: null })).toBe("@/proj/src/a.ts ");
  });

  it("treats a trailing separator as the same directory", () => {
    expect(selectionReference({ ...base, terminalCwd: "/proj/", lines: null })).toBe("@src/a.ts ");
  });

  it("offers nothing with no root or no file", () => {
    expect(selectionReference({ ...base, cwd: null, lines: null })).toBeNull();
    expect(selectionReference({ ...base, pathRel: "", lines: null })).toBeNull();
  });
});
