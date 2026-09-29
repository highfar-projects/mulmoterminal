// The file pane's tree | editor split, as numbers. The editor is AFTER the separator and is the side
// whose floor survives, so the tree width is the remainder of whatever the editor keeps.
import { clampSecondary, splitterKeySize, FILE_EDITOR_TREE } from "./splitterWidth";

export const TREE_WIDTH_DEFAULT_PX = 240;

/** A stored width, or the default when there is none or it is not a usable width. */
export function storedTreeWidth(raw: string | null): number {
  const width = Number(raw);
  return raw !== null && Number.isFinite(width) && width > 0 ? width : TREE_WIDTH_DEFAULT_PX;
}

export const clampTreeWidth = (width: number, available: number): number => clampSecondary(width, available, FILE_EDITOR_TREE);

/** The tree width a key produces, or null when the key is not the separator's — the caller must
 *  not preventDefault then, or a focused separator would swallow Tab. */
export function treeWidthForKey(key: string, treeWidth: number, available: number): number | null {
  const editorWidth = splitterKeySize(key, available - treeWidth, available, FILE_EDITOR_TREE, "horizontal", "after");
  return editorWidth === null ? null : clampTreeWidth(available - editorWidth, available);
}

interface MeasuredLabel {
  scrollWidth: number;
  clientWidth: number;
}

/** The row's tip: its name, only when the label cannot show all of it. */
export const clippedNameTip = (label: MeasuredLabel | null, name: string): string | null =>
  label !== null && label.scrollWidth > label.clientWidth ? name : null;
