// The Files pane's tabs (#2267): one editor, and a strip of files that take turns in it. Every way
// of opening a file goes through here, so "a path that already has a tab goes to that tab" holds
// for the tree, the finder, the search, a clicked terminal path and the host alike.
//
// The strip changes only AFTER the file arrived. Leaving a tab saves it (`load` flushes, as opening
// another file always has), and a save that could not land keeps the pane where it is — so the
// strip is asked about the file actually on screen, never the one that was requested.
import { ref, type Ref } from "vue";
import type { FilesTabState } from "../components/filesPaneState";
import { EMPTY_STRIP, closed, openedInFront, openedInNewTab, withTab, type TabStrip } from "../components/filesTabs";
import type { OpenFile } from "./useOpenFile";

export interface FilesTabs {
  strip: Ref<TabStrip>;
  /** Open `path` in the front tab, or go to its tab. `newTab` asks for a tab of its own. */
  open: (path: string, newTab?: boolean) => Promise<void>;
  close: (path: string) => Promise<void>;
  /** The strip with the front tab's place as it is right now, for a snapshot. */
  current: () => TabStrip;
  /** Put a remembered strip back and open its front tab. */
  restore: (strip: TabStrip, mayOpen: () => boolean) => Promise<void>;
  reset: () => void;
}

export function useFilesTabs(file: OpenFile): FilesTabs {
  const strip = ref<TabStrip>(EMPTY_STRIP);

  /** The open file as a tab, with the reader's place in it now. */
  const front = (): FilesTabState | null => (file.openPath.value ? { path: file.openPath.value, showPreview: file.showPreview.value, ...file.place() } : null);

  const current = (): TabStrip => {
    const tab = front();
    return tab ? withTab(strip.value, tab) : strip.value;
  };

  async function open(path: string, newTab = false): Promise<void> {
    const leaving = front();
    await file.load(path, false, strip.value.tabs.find((tab) => tab.path === path) ?? null);
    if (file.openPath.value !== path) return;
    // Asked of the strip as it is NOW: a tab closed while the read was out stays closed.
    const base = leaving ? withTab(strip.value, leaving) : strip.value;
    strip.value = newTab ? openedInNewTab(base, path) : openedInFront(base, path);
  }

  /** Open the tab the strip has in front. One whose file is gone is dropped and its neighbour tried
   *  in turn — the pane always skipped a deleted file — until a file arrives or no tab is left, so the
   *  strip never names a front that is not on screen. */
  async function showFront(): Promise<void> {
    const path = strip.value.activePath;
    if (!path) return;
    await open(path);
    if (file.openPath.value === path || strip.value.activePath !== path) return;
    strip.value = closed(strip.value, path);
    await showFront();
  }

  async function close(path: string): Promise<void> {
    if (path !== strip.value.activePath) {
      strip.value = closed(strip.value, path);
      return;
    }
    // Saved and emptied BEFORE the neighbour is read, so a neighbour whose file has gone cannot
    // leave the closed tab on screen.
    if (!(await file.close())) return;
    strip.value = closed(strip.value, path);
    await showFront();
  }

  async function restore(remembered: TabStrip, mayOpen: () => boolean): Promise<void> {
    // Something was opened while the tree was being put back — it is the more recent intent, and
    // takes the front tab's place as any plain open would.
    if (!mayOpen()) {
      const onScreen = file.openPath.value;
      strip.value = onScreen ? openedInFront(remembered, onScreen) : { ...remembered, activePath: null };
      return;
    }
    strip.value = remembered;
    await showFront();
  }

  return { strip, open, close, current, restore, reset: () => (strip.value = EMPTY_STRIP) };
}
