// The `command-palette` key on every screen (#2441). On the grid, useGridKeys takes it (sequences
// included); everywhere else nothing did, so the palette that can now go to any screen could only
// be opened with the mouse there. A single-key binding only: a sequence's wait lives in the grid.
import { activeKeymap } from "./activeKeymap";
import { openCommandPalette, paletteHost } from "./commandPalette";
import { gridShortcutFor } from "./gridShortcut";
import { useCaptureKeydown } from "./useCaptureKeydown";
import { keyYieldsToPage } from "./useGridKeys";

// Off the grid there are editors that are not form fields: the Files screen's CodeMirror is a
// contenteditable, which `keyYieldsToPage` (written for the grid, where none is on screen) misses.
const EDITABLE_CONTENT = '[contenteditable]:not([contenteditable="false"])';
const inEditableContent = (e: KeyboardEvent): boolean => e.target instanceof Element && e.target.closest(EDITABLE_CONTENT) !== null;

/** Whether this keydown opens the palette here: it is the palette's key, the grid is not the one to
 *  answer it, and it is not being typed into a field or an editor. */
export function opensPaletteAnywhere(e: KeyboardEvent, gridHasKeyboard: boolean): boolean {
  if (gridHasKeyboard || keyYieldsToPage(e) || inEditableContent(e)) return false;
  return gridShortcutFor(activeKeymap.value, e, { zoomed: false, manualOrder: true }) === "command-palette";
}

export function usePaletteKeyAnywhere(): void {
  useCaptureKeydown((e) => {
    if (!opensPaletteAnywhere(e, paletteHost.value?.available() ?? false)) return;
    e.preventDefault();
    e.stopPropagation();
    openCommandPalette();
  });
}
