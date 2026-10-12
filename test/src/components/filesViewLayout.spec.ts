import { describe, it, expect } from "vitest";
import { viewLayout, type FilesViewLayout } from "../../../src/components/filesViewLayout";

const layout = (showPreview: boolean, showCanvas: boolean, split: boolean): FilesViewLayout => viewLayout({ showPreview, showCanvas, split });
const shown = (l: FilesViewLayout): string =>
  [l.editor && "editor", l.preview && "preview", l.canvas && "canvas"].filter(Boolean).join("|") + (l.sideBySide ? " (split)" : "");

// Every combination of the three switches, written out: the table IS the rule (#3015).
describe("viewLayout", () => {
  it.each([
    [false, false, false, "editor"],
    [false, false, true, "editor|preview (split)"],
    [false, true, false, "canvas"],
    [false, true, true, "editor|canvas (split)"],
    [true, false, false, "preview"],
    [true, false, true, "preview"],
    [true, true, false, "canvas"],
    [true, true, true, "canvas"],
  ])("showPreview=%s showCanvas=%s split=%s shows %s", (showPreview, showCanvas, split, expected) => {
    expect(shown(layout(showPreview, showCanvas, split))).toBe(expected);
  });

  // Whatever the switches, something is on screen and at most two things are.
  const every = [false, true].flatMap((p) => [false, true].flatMap((c) => [false, true].map((s) => layout(p, c, s))));
  it("always shows one or two of the three, and two only when split", () => {
    every.forEach((l) => expect([l.editor, l.preview, l.canvas].filter(Boolean)).toHaveLength(l.sideBySide ? 2 : 1));
  });
});
