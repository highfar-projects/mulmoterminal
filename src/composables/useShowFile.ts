// Open a file in the Files pane in a given view and at a given line (#3022) — what `showInPane` and a
// checklist item ask for. The views are the pane's own switches (Preview, the Canvas view, side by
// side), set in the order that leaves exactly the asked-for one on screen.
import type { ComputedRef } from "vue";
import type { PaneTarget, PaneView } from "../../common/paneCommand";
import type { FileLocation } from "./filePathLocation";
import type { FilesTabs } from "./useFilesTabs";
import type { OpenFile } from "./useOpenFile";

export interface ShowFileDeps {
  tabs: Pick<FilesTabs, "open">;
  file: Pick<OpenFile, "openPath" | "showPreview" | "togglePreview">;
  canvasMode: { show: (path: string) => Promise<boolean>; hide: (path: string) => void };
  sideBySide: { active: ComputedRef<boolean>; toggle: () => Promise<void> };
  /** A located open: brings the editor back at that line, out of Preview and the Canvas view. */
  openAt: (pathRel: string, location: FileLocation, newTab: boolean) => Promise<void>;
}

export function showFileWith(deps: ShowFileDeps): (target: PaneTarget) => Promise<void> {
  const { file, canvasMode, sideBySide } = deps;
  const previewOff = async (): Promise<void> => {
    if (file.showPreview.value) await file.togglePreview();
  };
  const splitOff = async (): Promise<void> => {
    if (sideBySide.active.value) await sideBySide.toggle();
  };
  const apply: Record<PaneView, (path: string) => Promise<unknown>> = {
    editor: async (path) => {
      canvasMode.hide(path);
      await splitOff();
      await previewOff();
    },
    preview: async (path) => {
      canvasMode.hide(path);
      await splitOff();
      if (!file.showPreview.value) await file.togglePreview();
    },
    canvas: async (path) => {
      await splitOff();
      await canvasMode.show(path);
    },
    // Side by side is offered for Markdown only; anywhere else the toggle does nothing and the file
    // is left in the Canvas view alone.
    split: async (path) => {
      await previewOff();
      if (!sideBySide.active.value) await sideBySide.toggle();
      await canvasMode.show(path);
    },
  };
  return async (target) => {
    if (target.line !== undefined) return deps.openAt(target.path, { line: target.line, col: null }, false);
    // Asked to open on its editor, so the pane's carried view (#3075) is not put up only to be replaced.
    await deps.tabs.open(target.path, false, { path: target.path });
    // A switch the pane declined (an unsaved buffer it could not save) leaves another file in front.
    if (file.openPath.value === target.path) await apply[target.view](target.path);
  };
}
