// Where a clicked terminal path meets the Files pane. The link provider is registered per
// terminal connection, deep in useTerminalConnections; the pane belongs to TerminalGrid,
// which alone knows what is zoomed and whether the pane is open. A module singleton is how
// the two other cross-cutting terminal settings already meet their consumers (activeKeymap,
// copyOnSelect) — the alternative is threading a prop through every cell component.
//
// The opener answers whether it TOOK the click, so the caller can fall back to the route the
// path had before rather than swallowing it. TerminalGrid owns the guards about ITS state
// (what is zoomed, where the pane is rooted); tryOpenInPane below owns the two that are about
// the path itself.
import { isPaneViewable } from "./terminalFilePathLinkProvider";
import { pathWithinCwd } from "./pathWithinCwd";
import type { FileLocation } from "./filePathLocation";

/** Show `pathRel` (relative to `cwd`) in the pane, at `location` when one was named. False = not
 *  handled, use the old route. */
export type FilesPaneOpener = (cwd: string, pathRel: string, location?: FileLocation) => boolean;

let opener: FilesPaneOpener | null = null;

/** TerminalGrid registers on mount and clears on unmount — a stale opener would point at a
 *  pane that no longer exists, and report success for a click nothing acted on. */
export function setFilesPaneOpener(fn: FilesPaneOpener | null): void {
  opener = fn;
}

export function openInFilesPane(cwd: string, pathRel: string, location?: FileLocation): boolean {
  return opener?.(cwd, pathRel, location) ?? false;
}

/** First chance at a path clicked in terminal output: the pane beside the enlarged cell,
 *  when it can show that kind of file and the file is under that cell's own directory.
 *  False sends the click down the route it had before — a new tab, or the full-screen view. */
export function tryOpenInPane(filePath: string, cwd: string, location?: FileLocation): boolean {
  if (!isPaneViewable(filePath)) return false;
  const pathRel = pathWithinCwd(filePath, cwd);
  if (pathRel === null) return false;
  return openInFilesPane(cwd, pathRel, location);
}
