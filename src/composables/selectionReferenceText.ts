// What the Files pane's @ button types for the selected lines (#2575), as a composable so the pane
// only has to emit it. The agent reads the file ON DISK, so unsaved edits are saved first — otherwise
// the line numbers name other code.
import { selectionReference } from "../components/selectionReference";
import type { OpenFile } from "./useOpenFile";

export interface SelectionReferenceDeps {
  file: OpenFile;
  /** Whether there is a terminal beside the pane to insert into. */
  hasTarget: () => boolean;
  cwd: () => string | null;
  terminalCwd: () => string | null;
}

/** `@path#L10-20` for the selection (the file alone with none, or in Preview), or null when there is
 *  nothing to insert into, nothing open, or the save that had to come first did not land. */
export async function selectionReferenceText(deps: SelectionReferenceDeps): Promise<string | null> {
  const { file } = deps;
  const pathRel = file.openPath.value;
  if (!deps.hasTarget() || !pathRel || file.unpreviewable.value) return null;
  // Read before the save: saving can re-read the file, and the reader's selection is what they meant.
  const lines = file.showPreview.value ? null : (file.editor.value?.selectedLines() ?? null);
  if (!(await file.savedInPlace())) return null;
  return selectionReference({ pathRel, cwd: deps.cwd(), terminalCwd: deps.terminalCwd(), lines });
}
