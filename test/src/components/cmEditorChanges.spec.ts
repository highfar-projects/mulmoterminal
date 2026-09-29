import { describe, it, expect } from "vitest";
import { EditorView } from "codemirror";
import { createEditor } from "../../../src/components/cmEditor";

const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) };
Range.prototype.getClientRects = () => Object.assign([EMPTY_RECT], { item: () => EMPTY_RECT });
Range.prototype.getBoundingClientRect = () => EMPTY_RECT;

const mountEditor = () => {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createEditor(host, () => {});
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-content") ?? host);
  if (!view) throw new Error("no editor view");
  return { editor, host, view };
};
const marksIn = (host: HTMLElement): string[] =>
  [...host.querySelectorAll<HTMLElement>(".cm-change-gutter [data-change]")].map((el) => el.dataset.change ?? "");

// #2497, on the real editor: the marks appear, follow typing, survive a re-read, and go when told.
describe("the editor's change marks", () => {
  it("marks the lines that differ from HEAD", () => {
    const { editor, host } = mountEditor();
    editor.setDoc("one\nTWO\nthree", "a.ts");
    editor.setOriginal("one\ntwo\nthree");
    expect(marksIn(host)).toEqual(["modified"]);
  });

  it("follows the reader's typing", () => {
    const { editor, host, view } = mountEditor();
    editor.setDoc("one\ntwo", "a.ts");
    editor.setOriginal("one\ntwo");
    expect(marksIn(host)).toEqual([]);
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nthree" } });
    expect(marksIn(host)).toEqual(["added"]);
  });

  // Loading replaces the editor's whole state; a re-read of the same file must keep its marks.
  it("keeps the marks across a re-read of the file", () => {
    const { editor, host } = mountEditor();
    editor.setOriginal("one");
    editor.setDoc("one\ntwo", "a.ts");
    expect(marksIn(host)).toEqual(["added"]);
  });

  // The editor reads CRLF as LF; HEAD has to be read the same way, or nothing would be unchanged.
  it("marks nothing in an unchanged file with CRLF line endings", () => {
    const { editor, host } = mountEditor();
    editor.setDoc("one\r\ntwo\r\n", "a.ts");
    editor.setOriginal("one\r\ntwo\r\n");
    expect(marksIn(host)).toEqual([]);
    editor.setShowChanges(true);
    expect(host.querySelector(".cm-deletedChunk")).toBeNull();
  });

  it("shows none once told there is no HEAD version", () => {
    const { editor, host } = mountEditor();
    editor.setDoc("one\nTWO", "a.ts");
    editor.setOriginal("one\ntwo");
    editor.setOriginal(null);
    expect(marksIn(host)).toEqual([]);
  });

  // The toggle: removed lines shown in place, as a unified diff.
  it("shows removed lines in place when asked, and not otherwise", () => {
    const { editor, host } = mountEditor();
    editor.setDoc("one\nthree", "a.ts");
    editor.setOriginal("one\ntwo\nthree");
    expect(host.querySelector(".cm-deletedChunk")).toBeNull();
    editor.setShowChanges(true);
    expect(host.querySelector(".cm-deletedChunk")?.textContent).toContain("two");
    editor.setShowChanges(false);
    expect(host.querySelector(".cm-deletedChunk")).toBeNull();
  });
});
