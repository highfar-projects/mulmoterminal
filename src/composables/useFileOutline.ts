// The Files pane's outline of a Markdown file (#2576): its headings, which one the reader is under,
// and going to one — the line in the editor, or the heading in the Preview.
import { ref, type Ref, type ShallowRef } from "vue";
import type { CmEditor } from "../components/cmEditor";
import { currentHeadingIndex, markdownOutline, type OutlineHeading } from "../components/markdownOutline";

export interface FileOutlineDeps {
  editor: ShallowRef<CmEditor | null>;
  showPreview: Ref<boolean>;
  /** Ask the Preview document to scroll to a heading (by position, checked by text). */
  goToPreviewHeading: (index: number, text: string) => void;
}

export interface FileOutline {
  headings: Ref<OutlineHeading[]>;
  current: Ref<number | null>;
  /** Read the headings afresh — the buffer is what the reader sees; in Preview it is also what is on
   *  disk, since the Preview is only shown over a saved file. */
  refresh: () => void;
  pick: (index: number) => void;
}

export function useFileOutline(deps: FileOutlineDeps): FileOutline {
  const headings = ref<OutlineHeading[]>([]);
  const current = ref<number | null>(null);

  function refresh(): void {
    const editor = deps.editor.value;
    headings.value = markdownOutline(editor?.getDoc() ?? "");
    // The Preview's own scroll position is in pixels of a document the pane cannot read.
    current.value = deps.showPreview.value ? null : currentHeadingIndex(headings.value, editor?.topLine() ?? null);
  }

  function pick(index: number): void {
    const heading = headings.value[index];
    if (!heading) return;
    if (deps.showPreview.value) deps.goToPreviewHeading(index, heading.text);
    else deps.editor.value?.revealLine(heading.line);
  }

  return { headings, current, refresh, pick };
}
