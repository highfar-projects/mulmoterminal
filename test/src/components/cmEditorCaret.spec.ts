import { describe, it, expect } from "vitest";
import { createEditor } from "../../../src/components/cmEditor";

// #2149. Coming back to a file means coming back to the LINE, not to the top. The place is kept as
// line/column rather than a pixel offset because the pane is a different width next time — a
// narrower one wraps, and a `scrollTop` then points somewhere else in the text.
// jsdom has no layout, so CodeMirror's measuring throws the moment anything asks where a
// character IS on screen — which `goTo` does, because bringing the caret into view is half of what
// it is for. The rectangles are the part of the answer this file does not test; a zero-sized one
// keeps the measuring code quiet without pretending to know anything.
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects = () => Object.assign([EMPTY_RECT], { item: () => EMPTY_RECT });
Range.prototype.getBoundingClientRect = () => EMPTY_RECT;

const editorOn = (text: string) => {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createEditor(host, () => {});
  editor.setDoc(text, "notes.txt");
  return editor;
};

const lines = (n: number): string => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

describe("the editor's caret", () => {
  it("has nowhere to come back to in an empty document", () => {
    expect(editorOn("").caretAt()).toBeNull();
  });

  it("reports where the caret is, and puts it back", () => {
    const editor = editorOn(lines(40));
    editor.goTo({ line: 17, col: 3 });
    expect(editor.caretAt()).toEqual({ line: 17, col: 3 });
  });

  it("starts at the top of a freshly loaded file", () => {
    expect(editorOn(lines(10)).caretAt()).toEqual({ line: 1, col: 0 });
  });

  // The file may have been edited since — by the agent working in the same directory, which is the
  // ordinary case here. The nearest real line is closer to where the reader was than the top is.
  it("clamps a line past the end of what is there now", () => {
    const editor = editorOn(lines(5));
    editor.goTo({ line: 900, col: 0 });
    expect(editor.caretAt()).toEqual({ line: 5, col: 0 });
  });

  it("clamps a column past the end of its line", () => {
    const editor = editorOn(lines(5));
    editor.goTo({ line: 2, col: 999 });
    expect(editor.caretAt()).toEqual({ line: 2, col: "line 2".length });
  });

  // A document position is an integer. CodeMirror does not refuse a fractional one — it lands on a
  // fractional offset and reads back as a fractional column, which is then what gets remembered.
  // TRUNCATED, not rounded: `revealLine` truncated before the two became one function, and the
  // merge that joined them is no place to change what the search panel observes (Codex on #2156).
  it("lands on a whole position when handed a fractional one", () => {
    const editor = editorOn(lines(9));
    editor.goTo({ line: 3.7, col: 1.9 });
    expect(editor.caretAt()).toEqual({ line: 3, col: 1 });
  });

  it("reveals the same line main's truncating version did", () => {
    const editor = editorOn(lines(9));
    editor.revealLine(3.7);
    expect(editor.caretAt()).toEqual({ line: 3, col: 0 });
  });

  it.each([
    ["a line below one", { line: 0, col: 0 }],
    ["a negative line", { line: -4, col: 0 }],
    ["a negative column", { line: 3, col: -7 }],
  ])("survives %s", (_case, at) => {
    const editor = editorOn(lines(5));
    editor.goTo(at);
    const back = editor.caretAt();
    expect(back).toEqual({ line: expect.any(Number), col: expect.any(Number) });
    expect(back?.line).toBeGreaterThanOrEqual(1);
    expect(back?.col).toBeGreaterThanOrEqual(0);
  });

  // Loading another file is not a place to come back to: the caret belongs to the text it was in.
  it("reports the new file's top after the document is replaced", () => {
    const editor = editorOn(lines(40));
    editor.goTo({ line: 30, col: 0 });
    editor.setDoc(lines(3), "other.txt");
    expect(editor.caretAt()).toEqual({ line: 1, col: 0 });
  });
});

// #2149, the half a unit test nearly missed: scrolling moves neither the selection nor the caret,
// so "where was I" needs the screen as well as the cursor. jsdom has no layout, so what can be
// checked here is the CONTRACT — an empty document has no top line, the value is a line number of
// this document, and asking to scroll somewhere impossible does not throw. That the viewport
// actually moves was checked by driving a browser, which is where the defect was found.
describe("the editor's viewport", () => {
  it("has no top line in an empty document", () => {
    expect(editorOn("").topLine()).toBeNull();
  });

  it("reports a line of this document", () => {
    const editor = editorOn(lines(40));
    const top = editor.topLine();
    expect(top).toBeGreaterThanOrEqual(1);
    expect(top).toBeLessThanOrEqual(40);
  });

  it.each([
    ["past the end", 900],
    ["below the first line", 0],
    ["negative", -12],
    ["fractional", 3.7],
  ])("survives being asked to scroll to a line that is %s", (_case, line) => {
    const editor = editorOn(lines(5));
    expect(() => editor.scrollLineToTop(line)).not.toThrow();
    expect(editor.caretAt()).toEqual({ line: 1, col: 0 }); // and it does not move the caret
  });
});
