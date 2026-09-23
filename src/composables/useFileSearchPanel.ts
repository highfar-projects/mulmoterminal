// The Files pane's content-search panel, as state plus the two things it has to ask the pane for
// (#2140).
//
// Out of FilesPane.vue rather than in it because both halves are about the panel's relationship to
// the EDITOR, and neither is about the tree the pane otherwise is: which text the search cannot read
// off disk, and what opening a result has to do beyond opening the file.
import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { CmEditor } from "../components/cmEditor";

export interface FileSearchPanelDeps {
  /** The open buffer has unsaved edits. */
  dirty: Ref<boolean>;
  /** The file the editor is showing, or null. */
  openPath: Ref<string | null>;
  /** Changes on every edit. CodeMirror's document is not a Vue reactive source, so without a
   *  dependency that moves, `buffer` below computes once — when `dirty` first flips — and then
   *  answers with that first snapshot for the rest of the session. */
  editSeq: Ref<number>;
  /** The live editor — a getter, because the pane replaces it when the host element remounts and a
   *  captured reference would go on answering for an editor that is gone. */
  editor: () => CmEditor | null;
  /** Open a file and put the tree on it. Answers whether it actually got there — a reveal can end
   *  without opening anything: the file is gone, or leaving the current buffer was declined because
   *  it could not be saved. */
  revealPath: (pathRel: string) => Promise<boolean>;
}

export interface FileSearchPanel {
  open: Ref<boolean>;
  close: () => void;
  /** What the DISK cannot answer for, or null when nothing is dirty. `atEdit` is which edit the
   *  text was taken at — carried so the dependency is part of the VALUE rather than a bare read
   *  that a later refactor removes as unused. */
  buffer: ComputedRef<{ path: string; text: string; atEdit: number } | null>;
  onPick: (pathRel: string, line: number) => Promise<void>;
}

export function useFileSearchPanel(deps: FileSearchPanelDeps): FileSearchPanel {
  const open = ref(false);

  // Only when the buffer is actually DIRTY. A clean file is on disk, so the search already read the
  // same bytes and handing them over again would only cost a second scan of the same text.
  //
  // `editSeq` is READ and not used, which is the point: it is the only part of this that Vue can
  // see change. `dirty` flips once and stays true, and `getDoc()` reaches into CodeMirror, which
  // Vue does not track — so on those two alone the panel would keep the text as it stood at the
  // FIRST keystroke and show stale line numbers for the file on screen, which is the quiet failure
  // this whole mechanism exists to prevent.
  const buffer = computed(() => {
    const editor = deps.editor();
    if (!deps.dirty.value || !deps.openPath.value || !editor) return null;
    // `editSeq` is in the KEY, not just read for its side effect: it makes the dependency visible
    // to a reader as well as to Vue, and it survives a refactor that would delete a bare read as
    // unused. Without it this computes once — when `dirty` first flips — and then answers with that
    // first snapshot forever, because neither `dirty` nor CodeMirror's document moves again.
    return { path: deps.openPath.value, text: editor.getDoc(), atEdit: deps.editSeq.value };
  });

  /** Opening a result is "show me this line", not only "open this file". Revealing alone leaves the
   *  reader at the top of the file having to find the match again by hand, which is most of what the
   *  search was for.
   *
   *  The reveal is AWAITED before the jump: `revealPath` expands the tree and loads the file, and
   *  scrolling an editor that has not been given the document yet lands on the previous file. */
  async function onPick(pathRel: string, line: number): Promise<void> {
    open.value = false;
    // Only when the file REALLY opened. A reveal that failed — the file is gone, or the current
    // dirty buffer could not be saved and the pane declined to leave it — leaves the editor showing
    // the previous document, and scrolling THAT to the match's line number puts the cursor at an
    // arbitrary place in an unrelated file while looking deliberate.
    if (await deps.revealPath(pathRel)) deps.editor()?.revealLine(line);
  }

  return { open, close: () => (open.value = false), buffer, onPick };
}
