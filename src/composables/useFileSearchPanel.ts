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
  /** The live editor — a getter, because the pane replaces it when the host element remounts and a
   *  captured reference would go on answering for an editor that is gone. */
  editor: () => CmEditor | null;
  /** Open a file and put the tree on it. */
  revealPath: (pathRel: string) => Promise<void>;
}

export interface FileSearchPanel {
  open: Ref<boolean>;
  close: () => void;
  /** What the DISK cannot answer for, or null when nothing is dirty. */
  buffer: ComputedRef<{ path: string; text: string } | null>;
  onPick: (pathRel: string, line: number) => Promise<void>;
}

export function useFileSearchPanel(deps: FileSearchPanelDeps): FileSearchPanel {
  const open = ref(false);

  // Only when the buffer is actually DIRTY. A clean file is on disk, so the search already read the
  // same bytes and handing them over again would only cost a second scan of the same text.
  //
  // Read through `getDoc()` at the moment it is asked for, not watched: the panel re-reads this on
  // every keystroke of the query, and what it needs is the text as it stands then.
  const buffer = computed(() => {
    const editor = deps.editor();
    if (!deps.dirty.value || !deps.openPath.value || !editor) return null;
    return { path: deps.openPath.value, text: editor.getDoc() };
  });

  /** Opening a result is "show me this line", not only "open this file". Revealing alone leaves the
   *  reader at the top of the file having to find the match again by hand, which is most of what the
   *  search was for.
   *
   *  The reveal is AWAITED before the jump: `revealPath` expands the tree and loads the file, and
   *  scrolling an editor that has not been given the document yet lands on the previous file. */
  async function onPick(pathRel: string, line: number): Promise<void> {
    open.value = false;
    await deps.revealPath(pathRel);
    deps.editor()?.revealLine(line);
  }

  return { open, close: () => (open.value = false), buffer, onPick };
}
