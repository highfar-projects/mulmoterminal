// A read-only view of a document against its original, as one text with the removed lines in place — the Files
// pane's change display, without the editor around it. Unchanged stretches fold away, so a long document shows
// only what moved and a few lines either side.
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { unifiedMergeView } from "@codemirror/merge";
import { oneDark } from "@codemirror/theme-one-dark";

/** Lines kept around each change, and the shortest unchanged run worth folding. */
export const DIFF_CONTEXT_LINES = 2;
export const DIFF_FOLD_MIN_LINES = 4;

/** CodeMirror's words for the fold, in the person's language: `"$ unchanged lines"` → its translation, `$` the count. */
export type DiffPhrases = Readonly<Record<string, string>>;

export function createDiffView(parent: HTMLElement, original: string, current: string, phrases: DiffPhrases = {}): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: current,
      extensions: [
        oneDark,
        EditorState.phrases.of(phrases),
        EditorView.lineWrapping,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        unifiedMergeView({
          original,
          mergeControls: false,
          collapseUnchanged: { margin: DIFF_CONTEXT_LINES, minSize: DIFF_FOLD_MIN_LINES },
        }),
      ],
    }),
  });
}
