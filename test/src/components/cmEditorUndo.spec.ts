import { describe, it, expect, vi } from "vitest";
import { EditorView } from "codemirror";
import { EditorSelection } from "@codemirror/state";
import { createEditor } from "../../../src/components/cmEditor";

// #2258. Loading a file is not an edit, so it must not be something Undo can take back: undoing
// it emptied the buffer (or brought back the previous file's text), marked it dirty, and the pane
// then saved that over the file on the way out without asking.
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects = () => Object.assign([EMPTY_RECT], { item: () => EMPTY_RECT });
Range.prototype.getBoundingClientRect = () => EMPTY_RECT;

const editorWithSpy = () => {
  const host = document.createElement("div");
  document.body.append(host);
  const onChange = vi.fn();
  const editor = createEditor(host, onChange);
  const content = host.querySelector<HTMLElement>(".cm-content");
  if (!content) throw new Error("editor rendered no content element");
  return { editor, onChange, content };
};

// Through the keymap rather than by calling `undo` — the key is what the user presses, and it is
// what reaches the history through `basicSetup`.
const pressUndo = (content: HTMLElement): void => {
  content.dispatchEvent(new KeyboardEvent("keydown", { key: "z", keyCode: 90, ctrlKey: true, bubbles: true, cancelable: true }));
};

// An edit as the user makes one: a transaction on the live view, which the history records.
const typeAtEnd = (content: HTMLElement, text: string): void => {
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("no editor view behind the content element");
  const end = view.state.doc.length;
  view.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, userEvent: "input.type" });
};

describe("undo right after a file is opened", () => {
  it("changes nothing and does not report an edit", () => {
    const { editor, onChange, content } = editorWithSpy();
    editor.setDoc("AAA", "a.md");
    pressUndo(content);
    expect(editor.getDoc()).toBe("AAA");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not bring back the previously opened file", () => {
    const { editor, onChange, content } = editorWithSpy();
    editor.setDoc("AAA", "a.md");
    editor.setDoc("BBB", "b.md");
    pressUndo(content);
    expect(editor.getDoc()).toBe("BBB");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not undo an edit made to the previous file", () => {
    const { editor, onChange, content } = editorWithSpy();
    editor.setDoc("AAA", "a.md");
    typeAtEnd(content, "!");
    onChange.mockClear();
    editor.setDoc("BBB", "b.md");
    pressUndo(content);
    expect(editor.getDoc()).toBe("BBB");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still undoes an edit made to the file that is open", () => {
    const { editor, onChange, content } = editorWithSpy();
    editor.setDoc("AAA", "a.md");
    typeAtEnd(content, "!");
    expect(editor.getDoc()).toBe("AAA!");
    pressUndo(content);
    expect(editor.getDoc()).toBe("AAA");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

// #2575. The lines a selection covers, for `@file#L10-20`.
describe("selectedLines", () => {
  const select = (content: HTMLElement, anchor: number, head: number): void => {
    const view = EditorView.findFromDOM(content);
    if (!view) throw new Error("no editor view behind the content element");
    view.dispatch({ selection: { anchor, head } });
  };

  it("is null with nothing selected, and the lines of a selection otherwise", () => {
    const { editor, content } = editorWithSpy();
    editor.setDoc("one\ntwo\nthree\nfour\n", "a.ts");
    expect(editor.selectedLines()).toBeNull();
    select(content, 5, 12); // "wo\nthre"
    expect(editor.selectedLines()).toEqual({ from: 2, to: 3 });
    select(content, 12, 5); // the same, selected upwards
    expect(editor.selectedLines()).toEqual({ from: 2, to: 3 });
  });

  // A column selection (Alt-drag) is one range per line; the reference is the lines they span. Ranges
  // far apart are not joined into lines nobody chose — the main one stands alone then.
  it("joins ranges on adjoining lines, and keeps the main range when they are apart", () => {
    const { editor, content } = editorWithSpy();
    editor.setDoc("one\ntwo\nthree\nfour\n", "a.ts");
    const view = EditorView.findFromDOM(content);
    if (!view) throw new Error("no editor view behind the content element");
    view.dispatch({ selection: EditorSelection.create([EditorSelection.range(4, 5), EditorSelection.range(8, 10)], 0) });
    expect(editor.selectedLines()).toEqual({ from: 2, to: 3 });
    view.dispatch({ selection: EditorSelection.create([EditorSelection.range(4, 5), EditorSelection.range(14, 16)], 1) });
    expect(editor.selectedLines()).toEqual({ from: 4, to: 4 });
  });

  // A column selection over a blank line puts a bare cursor there; the blank line is not a gap.
  it("bridges a blank line inside a column selection, even when it is the first", () => {
    const { editor, content } = editorWithSpy();
    editor.setDoc("ab\n\nab\n", "a.ts");
    const view = EditorView.findFromDOM(content);
    if (!view) throw new Error("no editor view behind the content element");
    view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.cursor(3), EditorSelection.range(4, 6)], 0) });
    expect(editor.selectedLines()).toEqual({ from: 1, to: 3 });
    editor.setDoc("\nab\nab\n", "a.ts");
    view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(0), EditorSelection.range(1, 3), EditorSelection.range(4, 6)], 0) });
    expect(editor.selectedLines()).toEqual({ from: 2, to: 3 });
  });

  // Selecting whole lines by dragging down ends at the start of the next one, which was not chosen.
  it("does not take the line a selection merely ends at the start of", () => {
    const { editor, content } = editorWithSpy();
    editor.setDoc("one\ntwo\nthree\n", "a.ts");
    select(content, 4, 14); // "two\nthree\n" ends at the start of the empty last line
    expect(editor.selectedLines()).toEqual({ from: 2, to: 3 });
    select(content, 4, 5); // one character on line 2
    expect(editor.selectedLines()).toEqual({ from: 2, to: 2 });
  });
});

// #2574. Restoring a kept version is an EDIT, unlike loading a file: it reports a change (so the
// buffer is unsaved) and Undo takes it back to what was there.
describe("replaceDoc", () => {
  it("is an edit the listener hears and Undo reverses", () => {
    const { editor, onChange, content } = editorWithSpy();
    editor.setDoc("current text", "a.md");
    editor.replaceDoc("kept text");
    expect(editor.getDoc()).toBe("kept text");
    expect(onChange).toHaveBeenCalled();
    pressUndo(content);
    expect(editor.getDoc()).toBe("current text");
  });
});
