// The `command-palette` key on every screen (#2441). On the grid, useGridKeys takes it (sequences
// included); everywhere else nothing did, so the palette that can now go to any screen could only
// be opened with the mouse there. A single-key binding only: a sequence's wait lives in the grid.
import { activeKeymap } from "./activeKeymap";
import { openCommandPalette, paletteHost } from "./commandPalette";
import { gridShortcutFor } from "./gridShortcut";
import { useCaptureKeydown } from "./useCaptureKeydown";
import { keyYieldsToPage } from "./useGridKeys";

/** Whether this keydown opens the palette here: it is the palette's key, the grid is not the one to
 *  answer it, and it is not being typed into a field. */
export function opensPaletteAnywhere(e: KeyboardEvent, gridHasKeyboard: boolean): boolean {
  if (gridHasKeyboard || keyYieldsToPage(e)) return false;
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
