// Putting a remembered Files pane back at startup: its open folders, its tabs, and where the tree was
// scrolled to.
import { nextTick } from "vue";
import type { FilesPaneState } from "../components/filesPaneState";
import { restoreLevels } from "../components/filesTreeState";
import type { useFilesCanvasMode } from "./useFilesCanvasMode";
import type { FilesTabs } from "./useFilesTabs";
import type { FilesTree } from "./useFilesTree";
import type { SideBySide } from "./useSideBySide";
import type { OpenFile } from "./useOpenFile";

export interface PaneRestoreDeps {
  tree: Pick<FilesTree, "findNode" | "toggleDir">;
  file: Pick<OpenFile, "generation">;
  canvasMode: Pick<ReturnType<typeof useFilesCanvasMode>, "reset">;
  tabs: Pick<FilesTabs, "restore">;
  sideBySide: Pick<SideBySide, "switchedOn">;
  treeEl: () => HTMLElement | null;
}

/** Open the remembered directories parents-first (each fetches its children), then the file that was
 *  open. Anything since deleted simply isn't found and is skipped. `reqIdAtStart` is the read
 *  generation at the beginning of the pane's start — the remembered file is opened only when no
 *  competing request arrived during THIS startup cycle. */
export async function restorePaneState(deps: PaneRestoreDeps, state: FilesPaneState | null, reqIdAtStart: number): Promise<void> {
  if (!state) return;
  const { tree, file, canvasMode, tabs } = deps;
  // One wait per DEPTH, not one per directory. A level can only be looked up once the level above
  // it has its children, so the levels stay sequential — but siblings within a level are
  // independent fetches into their own nodes, and awaiting them one at a time was the whole of the
  // delay this pane was reported for (#2148).
  for (const level of restoreLevels(state.expanded)) {
    await Promise.all(
      level.map(async (dirPath) => {
        const node = tree.findNode(dirPath);
        if (node?.dir && !node.expanded) await tree.toggleDir(node);
      }),
    );
  }
  // A pane opened FOR a file (#1979) starts on it as text, as it would with Preview: when an open got here
  // first — landed or still in flight, so its path cannot be asked — no remembered Canvas view or split comes back.
  if (file.generation() === reqIdAtStart) {
    canvasMode.reset(state.tabs.filter((tab) => tab.showCanvas === true).map((tab) => tab.path));
    deps.sideBySide.switchedOn.value = state.sideBySide === true;
  }
  await tabs.restore({ tabs: state.tabs, activePath: state.activePath }, () => file.generation() === reqIdAtStart);
  // Last, and only after a tick: the rows have to exist before there is anything to scroll past,
  // and the expansions above are what create them.
  if (state.treeScrollTop !== undefined) {
    await nextTick();
    const treeEl = deps.treeEl();
    if (treeEl) treeEl.scrollTop = state.treeScrollTop;
  }
}
