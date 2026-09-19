// One stand-in for the CodeMirror editor, shared by every spec that mounts the Files pane.
//
// It is typed as `CmEditor` on purpose: seven specs had hand-written literals, and adding a method
// to the interface (`caretAt`/`goTo`, #2149) turned all seven into objects the pane calls a missing
// function on — silently, one spec at a time. Typed and shared, the next addition breaks here, in
// one place, before anything runs.
import { vi } from "vitest";
import type { CaretAt, CmEditor } from "../../src/components/cmEditor";

/** Every method is a spy, and the object still satisfies `CmEditor` — which is the point: add a
 *  method to the interface and this stops compiling, rather than seven specs calling a missing
 *  function at runtime. */
export type CmEditorDouble = {
  [K in keyof CmEditor]: ReturnType<typeof vi.fn> & CmEditor[K];
};

/** `doc` is what `getDoc()` answers — the buffer the pane saves. `caret` is where the reader starts.
 *
 *  The caret MOVES the way the real editor moves it: `setDoc` collapses it to the top, because
 *  replacing the document is what CodeMirror does to a selection, and `goTo` puts it where it is
 *  asked. A double that answered a fixed caret hid a real defect for a whole review round — the
 *  external-change refresh threw the reader to line 1 and every spec stayed green (#2156). */
export function fakeCmEditor(doc = "", caret: CaretAt | null = null, topLine: number | null = null): CmEditorDouble {
  let at: CaretAt | null = caret;
  let top: number | null = topLine;
  const editor: CmEditor = {
    setDoc: vi.fn(() => {
      at = { line: 1, col: 0 };
      top = 1;
    }),
    getDoc: vi.fn(() => doc),
    caretAt: vi.fn(() => at),
    goTo: vi.fn((to: CaretAt) => {
      at = to;
    }),
    // Scrolling and the caret are SEPARATE in the real editor, which is the whole reason the pane
    // remembers both — so the double keeps its own top line and does not touch the caret with it.
    topLine: vi.fn(() => top),
    scrollLineToTop: vi.fn((line: number) => {
      top = line;
    }),
    // The real one is `goTo` at the line's start plus focus, so the caret moves the same way here.
    revealLine: vi.fn((line: number) => {
      at = { line, col: 0 };
    }),
    destroy: vi.fn(),
  };
  return editor as CmEditorDouble;
}
