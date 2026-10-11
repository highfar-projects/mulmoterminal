// Opening a file the pane was asked for from outside it: a path clicked in terminal output (drawn
// when it has something to draw, #2269), at the line an agent named (`a.ts:42`, #2573), or the
// full-screen view's `?path=&line=`. The pane and the full-screen view differ in who gets the keyboard.
import { nextTick } from "vue";
import { fileMediaKind, filePreviewKind } from "../components/filePreviewKind";
import type { FileLocation } from "./filePathLocation";
import type { FilesTabs } from "./useFilesTabs";
import type { OpenFile } from "./useOpenFile";

export function useRequestedOpen(
  tabs: FilesTabs,
  file: OpenFile,
  /** Takes `pathRel` out of any view that is not its text (the Canvas view, #3010). The REQUEST, not the
   *  landing, does it: asked before the open, so a file in that view does not start drawing only to be
   *  put away, and a declined or superseded open still leaves it on its editor for the next visit. */
  showText: (pathRel: string) => void = () => {},
): {
  openAt: (pathRel: string, location: FileLocation, focus: boolean, newTab?: boolean) => Promise<void>;
  openRequested: (pathRel: string, location: FileLocation | null) => Promise<void>;
  openFromTerminal: (pathRel: string, location: FileLocation | undefined, newTab: boolean) => Promise<void>;
} {
  // The newest located open. Reads can come back out of order, and the line the reader clicked LAST
  // is the one to show — an older click resuming later must not scroll over it.
  let locatedOpens = 0;

  /** Open `pathRel` at `location`. The line lives in the text, so a tab up in Preview or the Canvas view goes to Edit; a
   *  picture, a PDF or a video has no line and simply opens. Columns arrive 1-based, as the tools print them. `focus`
   *  only where no terminal is beside the pane: a click in the grid leaves the keyboard in the
   *  terminal, or a reply typed to the agent would land in the file. */
  async function openAt(pathRel: string, location: FileLocation, focus: boolean, newTab = false): Promise<void> {
    if (fileMediaKind(pathRel) !== null) return tabs.open(pathRel, newTab);
    const mine = ++locatedOpens;
    showText(pathRel);
    await tabs.open(pathRel, newTab, { path: pathRel, showPreview: false });
    if (mine !== locatedOpens || file.openPath.value !== pathRel) return;
    if (file.showPreview.value) await file.togglePreview();
    await nextTick();
    if (mine !== locatedOpens) return;
    const at = { line: location.line, col: location.col === null ? 0 : location.col - 1 };
    if (focus) file.editor.value?.revealLine(at.line, at.col);
    else file.editor.value?.goTo(at);
  }

  // The full-screen view has no terminal beside it, so the file it was asked for takes the keyboard.
  const openRequested = (pathRel: string, location: FileLocation | null): Promise<void> => (location ? openAt(pathRel, location, true) : tabs.open(pathRel));

  // A page, an SVG or a table comes up drawn: a path clicked in terminal output to a chart is asking
  // to see the chart, and a CSV opened from there as a table before the pane took the click (#2559).
  const opensDrawn = (pathRel: string): boolean => {
    const kind = filePreviewKind(pathRel);
    return kind === "html" || kind === "svg" || kind === "table";
  };

  /** A path clicked in terminal output with no line named: drawn when it has something to draw, in a
   *  new tab when the click asked for one (#3005). */
  const openClicked = (pathRel: string, newTab: boolean): Promise<void> =>
    tabs.open(pathRel, newTab, opensDrawn(pathRel) ? { path: pathRel, showPreview: true } : undefined);

  /** A path clicked in terminal output beside the pane: at its line when one was named, leaving the
   *  keyboard in the terminal; in a new tab when the click asked for one (#3005). */
  const openFromTerminal = (pathRel: string, location: FileLocation | undefined, newTab: boolean): Promise<void> =>
    location ? openAt(pathRel, location, false, newTab) : openClicked(pathRel, newTab);

  return { openAt, openRequested, openFromTerminal };
}
