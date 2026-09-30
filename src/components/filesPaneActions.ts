// The grid actions the Files pane answers: the two that open a panel over it, and the three that act
// on its tabs (#2267). One list so the grid hands them all to TerminalGrid through one entrance.
import type { KeymapAction } from "../../common/keymap";

export type FilesTabAction = "files-tab-close" | "files-tab-next" | "files-tab-prev";
export type FilesPaneAction = "files-find" | "files-search" | FilesTabAction | "files-insert-selection";

const FILES_PANE_ACTIONS: readonly FilesPaneAction[] = [
  "files-find",
  "files-search",
  "files-tab-close",
  "files-tab-next",
  "files-tab-prev",
  "files-insert-selection",
];

export const isFilesPaneAction = (action: KeymapAction): action is FilesPaneAction => FILES_PANE_ACTIONS.some((entry) => entry === action);

// The ones the full-screen Files view answers too (#2655). Not `files-insert-selection`: it inserts at
// a terminal's prompt, and that view has no terminal beside it.
export type FilesScreenAction = Exclude<FilesPaneAction, "files-insert-selection">;
export const isFilesScreenAction = (action: KeymapAction): action is FilesScreenAction => isFilesPaneAction(action) && action !== "files-insert-selection";
