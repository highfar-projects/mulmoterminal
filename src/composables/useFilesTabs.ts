// The Files pane's tabs (#2267): one editor, and a strip of files that take turns in it. Every way
// of opening a file goes through here, so "a path that already has a tab goes to that tab" holds
// for the tree, the finder, the search, a clicked terminal path and the host alike.
//
// The strip changes only AFTER the file arrived. Leaving a tab saves it (`load` flushes, as opening
// another file always has), and a save that could not land keeps the pane where it is — so the
// strip is asked about the file actually on screen, never the one that was requested.
import { computed, ref, type Ref } from "vue";
import type { FilesTabState } from "../components/filesPaneState";
import { EMPTY_STRIP, closed, openedInFront, openedInNewTab, steppedPath, tabLabels, withTab, type TabStrip } from "../components/filesTabs";
import type { OpenFile } from "./useOpenFile";

export interface FilesTabs {
  strip: Ref<TabStrip>;
  /** Open `path` in the front tab, or go to its tab. `newTab` asks for a tab of its own; `fresh` is
   *  how a file with no tab yet should come up (Preview, say) — a tab it already has wins. */
  open: (path: string, newTab?: boolean, fresh?: FilesTabState) => Promise<void>;
  close: (path: string) => Promise<void>;
  /** Close the tab in front — the last one too, which leaves the pane empty. */
  closeFront: () => Promise<void>;
  /** Bring the next (1) or previous (-1) tab forward, going round at the ends. */
  step: (step: 1 | -1) => Promise<void>;
  /** The strip with the front tab's place as it is right now, for a snapshot. */
  current: () => TabStrip;
  /** Put a remembered strip back and open its front tab. */
  restore: (strip: TabStrip, mayOpen: () => boolean) => Promise<void>;
  reset: () => void;
}

/** How a file with no tab of its own, opened with nothing asked of it, comes up (#3075): the view
 *  the pane's session last chose. `viewFor` says which view, or null for the editor; `landed` puts
 *  the Canvas view up once the file is in front, since that view is not the open file's to load. */
export interface InheritedView {
  viewFor: (path: string) => { showPreview: boolean; showCanvas: boolean } | null;
  landed: (path: string) => Promise<void>;
}

/** `opening` hears every open before it starts, the file already in front included — which is the case
 *  no change of path can report (#3079: a gallery over the pane goes whenever a file is opened). */
export function useFilesTabs(file: OpenFile, inherit?: InheritedView, opening: () => void = () => {}): FilesTabs {
  const strip = ref<TabStrip>(EMPTY_STRIP);

  /** The open file as a tab, with the reader's place in it now. */
  const front = (): FilesTabState | null => (file.openPath.value ? { path: file.openPath.value, showPreview: file.showPreview.value, ...file.place() } : null);

  const current = (): TabStrip => {
    const tab = front();
    return tab ? withTab(strip.value, tab) : strip.value;
  };

  async function open(path: string, newTab = false, fresh?: FilesTabState): Promise<void> {
    opening();
    const leaving = front();
    const own = strip.value.tabs.find((tab) => tab.path === path);
    const inherited = own || fresh ? null : (inherit?.viewFor(path) ?? null);
    await file.load(path, false, own ?? fresh ?? (inherited ? { path, showPreview: inherited.showPreview } : null));
    if (file.openPath.value !== path) return;
    // Asked of the strip as it is NOW: a tab closed while the read was out stays closed.
    const base = leaving ? withTab(strip.value, leaving) : strip.value;
    strip.value = newTab ? openedInNewTab(base, path) : openedInFront(base, path);
    if (inherited?.showCanvas) await inherit?.landed(path);
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

  async function closeFront(): Promise<void> {
    const path = strip.value.activePath;
    if (path) await close(path);
  }

  async function step(by: 1 | -1): Promise<void> {
    const path = steppedPath(strip.value, by);
    if (path) await open(path);
  }

  return { strip, open, close, closeFront, step, current, restore, reset: () => (strip.value = EMPTY_STRIP) };
}

/** What the pane draws of the strip. */
export function tabStripView(strip: Ref<TabStrip>, openPath: Ref<string | null>) {
  return {
    // One tab is the pane as it always was — the header names the file. The strip is for two or more,
    // and for a lone tab that is not on screen, which would otherwise have no control at all.
    showStrip: computed(() => strip.value.tabs.length > 1 || strip.value.tabs.some((tab) => tab.path !== openPath.value)),
    // The one tab in the Tab order: the front one, or the first when none is in front — a strip whose
    // tabs are all -1 cannot be reached from the keyboard.
    focusablePath: computed(() => strip.value.activePath ?? strip.value.tabs[0]?.path ?? null),
    labels: computed(() => tabLabels(strip.value.tabs.map((tab) => tab.path))),
  };
}
