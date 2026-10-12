// Linkify file paths in the output, scoped to the session's live cwd (read lazily, since
// it's learned after connect). The pane beside an enlarged cell gets first refusal, so a
// click can land NEXT to the terminal it came from; failing that, a document or an image
// opens in a new tab through the file routes, and source opens in the app's own Files view.
import type { Terminal } from "@xterm/xterm";
import { createFilePathLinkProvider } from "./terminalFilePathLinkProvider";
import { openOutsideFile, tryOpenInPane } from "./filesPaneOpener";
import { filesGotoFile } from "./useFilesView";

export function registerFilePathLinks(term: Terminal, getCwd: () => string | null): void {
  term.registerLinkProvider(
    createFilePathLinkProvider(
      term,
      getCwd,
      (url) => window.open(url, "_blank", "noopener,noreferrer"),
      (filePath, cwd, location) => filesGotoFile(cwd, filePath, location),
      (filePath, cwd, location, newTab) => tryOpenInPane(filePath, cwd, location, newTab),
      openOutsideFile,
    ),
  );
}
