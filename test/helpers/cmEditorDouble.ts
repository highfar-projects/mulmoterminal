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

/** `doc` is what `getDoc()` answers — the buffer the pane saves. `caret` is where the reader is,
 *  which a spec only cares about when it is checking what the pane remembers. */
export function fakeCmEditor(doc = "", caret: CaretAt | null = null): CmEditorDouble {
  const editor: CmEditor = {
    setDoc: vi.fn(),
    getDoc: vi.fn(() => doc),
    caretAt: vi.fn(() => caret),
    goTo: vi.fn(),
    destroy: vi.fn(),
  };
  return editor as CmEditorDouble;
}
