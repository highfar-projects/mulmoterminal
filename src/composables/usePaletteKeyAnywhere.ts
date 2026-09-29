// The app's keys on every screen: `command-palette` (#2441), the toolbar's operations (#2639), and
// the `files-*` keys on the full-screen Files view (#2655).
// On the grid, useGridKeys takes them (sequences included); everywhere else nothing did. A single-key
// binding only: a sequence's wait lives in the grid.
import { activeKeymap } from "./activeKeymap";
import { openCommandPalette, paletteHost } from "./commandPalette";
import { gridShortcutFor } from "./gridShortcut";
import { useCaptureKeydown } from "./useCaptureKeydown";
import { keyYieldsToPage } from "./useGridKeys";
import { runAppAction } from "./runAppAction";
import { isAppAction, type AppAction } from "../../common/appActions";
import { filesScreenOpen, runOnFilesScreen } from "./filesScreenHost";
import { isFilesScreenAction, type FilesScreenAction } from "../components/filesPaneActions";

// Off the grid there are editors that are not form fields: the Files screen's CodeMirror is a
// contenteditable, which `keyYieldsToPage` (written for the grid, where none is on screen) misses.
const EDITABLE_CONTENT = '[contenteditable]:not([contenteditable="false"])';
const inEditableContent = (e: KeyboardEvent): boolean => e.target instanceof Element && e.target.closest(EDITABLE_CONTENT) !== null;

type AnywhereAction = "command-palette" | AppAction | FilesScreenAction;

/** The app action this keydown runs here, or null: it is bound to one, the grid is not the one to
 *  answer it, and it is not being typed into a field or an editor. Evaluated as if a terminal were
 *  enlarged, which is what lets the `files-*` keys through the grid's gate; none of the others asks. */
export function appKeyAnywhere(e: KeyboardEvent, gridHasKeyboard: boolean): AnywhereAction | null {
  if (gridHasKeyboard || keyYieldsToPage(e)) return null;
  const action = gridShortcutFor(activeKeymap.value, e, { zoomed: true, manualOrder: true });
  // Inside the Files view's editor too, as beside a grid cell, where the grid's keys pass a
  // contenteditable through: a tab key is for the file being edited.
  if (action !== null && isFilesScreenAction(action)) return filesScreenOpen() ? action : null;
  if (inEditableContent(e)) return null;
  return action === "command-palette" || isAppAction(action) ? action : null;
}

/** Whether this keydown opens the palette here. */
export const opensPaletteAnywhere = (e: KeyboardEvent, gridHasKeyboard: boolean): boolean => appKeyAnywhere(e, gridHasKeyboard) === "command-palette";

export function usePaletteKeyAnywhere(): void {
  useCaptureKeydown((e) => {
    const action = appKeyAnywhere(e, paletteHost.value?.available() ?? false);
    if (action === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === "command-palette") openCommandPalette();
    else if (isAppAction(action)) runAppAction(action);
    else runOnFilesScreen(action);
  });
}
