// The full-screen Files view's side of the `files-*` keys and the palette's `/` and `#` (#2655).
// Those reach the Files pane beside an enlarged grid cell through the grid; the full-screen view is
// not in the grid, so it registers here while it is mounted, the way the grid registers its host.
import { shallowRef } from "vue";
import type { FilesScreenAction } from "../components/filesPaneActions";

export interface FilesScreenHost {
  /** Whether the view is on screen, so an action has a pane to act on. */
  open: () => boolean;
  run: (action: FilesScreenAction) => void;
}

export const filesScreenHost = shallowRef<FilesScreenHost | null>(null);

/** Register; returns how to withdraw, which only clears the host it registered. */
export function provideFilesScreenHost(host: FilesScreenHost): () => void {
  filesScreenHost.value = host;
  return () => {
    if (filesScreenHost.value === host) filesScreenHost.value = null;
  };
}

/** Whether the full-screen Files view is up to take a `files-*` action. */
export const filesScreenOpen = (): boolean => filesScreenHost.value?.open() ?? false;

/** Run `action` on the full-screen Files view; false when it is not up. */
export function runOnFilesScreen(action: FilesScreenAction): boolean {
  const host = filesScreenHost.value;
  if (!host?.open()) return false;
  host.run(action);
  return true;
}
