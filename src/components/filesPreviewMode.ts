// Which of the Files pane's two views is up, at the two moments that is not simply "whatever the
// user last clicked": loading a file, and restoring a remembered pane (#2137). Both answer the
// same question — the Markdown preview belongs to the FILE it was turned on for — and both are
// pure, so a mode that outlives its file is catchable without mounting a pane.

/** Whether the pane is staying on the file it is already on. Two things hang off it, and both are
 *  about the same idea — a re-read is not a departure:
 *
 *  - the VIEW MODE. Opening another file drops it: the preview iframe is shown on
 *    `openPath && !unpreviewable && showPreview` and does not ask whether the file is Markdown,
 *    while the toggle back to the editor does, so a preview left up over the file just picked has
 *    no way out of it.
 *  - the CARET. `setDoc` collapses the selection to the top, so without carrying it a reader at
 *    line 200 is thrown to line 1 by the thirty-second version check (#2156).
 *
 *  The same-path callers are the conflict banner's Reload and the external-change refresh. */
export const staysOnSameFile = (openPath: string | null, nextPath: string): boolean => openPath === nextPath;

/** The half of a remembered pane state the mode is decided from. */
export interface RememberedView {
  openPath: string | null;
  showPreview?: boolean;
}

/** What the file a restore asked for turned out to be, once it had been read. */
export interface ReopenedFile {
  /** Where the pane landed. The pane asks only after a read it has adopted, so this is the
   *  remembered path there; the comparison is what keeps the answer right for a caller that asks
   *  earlier, when the read failed or another file is what arrived. */
  openPath: string | null;
  isMarkdown: boolean;
  /** The server refused to serve it as text (415). */
  unpreviewable: boolean;
}

/** Whether a restored pane comes back in Preview. Only over the very path the mode was remembered
 *  for, and only while that path still holds Markdown the server served as text: a path holds
 *  whatever is there NOW, so the `.md` may since be a binary — and previewing one is a blank
 *  iframe with no editor behind it. Anything else falls back to the editor. */
export const restoresPreview = (remembered: RememberedView, reopened: ReopenedFile): boolean =>
  remembered.showPreview === true &&
  remembered.openPath !== null &&
  reopened.openPath === remembered.openPath &&
  reopened.isMarkdown &&
  !reopened.unpreviewable;
