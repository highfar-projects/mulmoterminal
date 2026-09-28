// What the Files pane hands its host to put back later, and what the host hands back. Its own
// module because three parties decide from it and none of them owns it: the pane fills it, the grid
// files it per cell, and `filesPaneStore` puts it in localStorage per directory — a shape that
// outlives the component it used to live in (#2158).
import type { CaretAt } from "./cmEditor";

/** One open file, as the pane remembers it (#2267). Everything here belongs to the FILE rather than
 *  the pane: another file has its own mode, caret and scroll. */
export interface FilesTabState {
  /** Relative to the pane's root. */
  path: string;
  /** Whether it was being READ in the Markdown preview rather than edited (#2137). Optional because
   *  nothing written before this existed carries one — absent is the editor. */
  showPreview?: boolean;
  /** Where the reader was in it, so coming back does not mean finding the line again (#2149). A
   *  place in the file, not a pixel: the pane is often a different width next time. */
  caret?: CaretAt | undefined;
  /** The line that was at the TOP of the editor. Kept beside the caret because scrolling moves
   *  neither the selection nor the caret — a reader who never clicks has a caret on line 1 while
   *  reading line 130, and the caret alone would put them back at the top of the file. */
  topLine?: number | undefined;
  /** How far down the PREVIEW was scrolled, in CSS pixels from the top of the rendered document
   *  (#2157). A pixel here where the editor's half of this is a line, because the preview is a
   *  rendered document with no lines in it — and because the offset is reported by, and handed
   *  back to, a document that knows nothing else about itself. */
  previewScrollTop?: number;
}

/** What a host hands back so a revisited directory looks the way it was left. */
export interface FilesPaneState {
  /** The open files, in the order they were opened. */
  tabs: FilesTabState[];
  /** The path of the tab in front — which one, by identity rather than by position, so reordering
   *  or closing another tab cannot move the front to a different file. Null when none is open. */
  activePath: string | null;
  expanded: string[];
  /** How far down the tree was scrolled. The expanded directories are remembered already, so the
   *  same rows come back — this is which of them were on screen. */
  treeScrollTop?: number;
}

/** The tab in front, or null when nothing is open or the front names a tab that is not there. */
export const activeTab = (state: FilesPaneState): FilesTabState | null => state.tabs.find((tab) => tab.path === state.activePath) ?? null;
