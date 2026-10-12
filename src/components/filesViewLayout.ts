// What the Files pane's file area shows, from the three switches that decide it (#3015). One place,
// because "is the editor on screen" gates the controls that act on it, and each of those used to
// spell it out again.

export interface FilesViewSwitches {
  /** The file is being read in Preview rather than edited. */
  showPreview: boolean;
  /** The file is drawn by the Canvas's plugin view (#3009). */
  showCanvas: boolean;
  /** Side by side is switched on and offered for this file (Markdown). */
  split: boolean;
}

export interface FilesViewLayout {
  editor: boolean;
  preview: boolean;
  canvas: boolean;
  /** Two halves: the editor on the left, Preview or the Canvas view on the right. */
  sideBySide: boolean;
}

/** Preview alone turns side by side off, as it always has; the Canvas view only takes the right half. */
export function viewLayout({ showPreview, showCanvas, split }: FilesViewSwitches): FilesViewLayout {
  const sideBySide = split && !showPreview;
  return {
    editor: !showPreview && (!showCanvas || sideBySide),
    preview: !showCanvas && (showPreview || sideBySide),
    canvas: showCanvas,
    sideBySide,
  };
}
