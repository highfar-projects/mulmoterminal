// The Files pane's tab strip as values (#2267): which files are open, which one is in front, and
// what each way of opening or closing does to that. Pure, so every rule about where a tab lands is
// testable without mounting a pane — the pane only asks these once the file has actually arrived.
import type { FilesPaneState, FilesTabState } from "./filesPaneState";
import { MAX_TABS } from "./filesPaneStore";

export type TabStrip = Pick<FilesPaneState, "tabs" | "activePath">;

export const EMPTY_STRIP: TabStrip = { tabs: [], activePath: null };

const indexOf = (strip: TabStrip, path: string | null): number => strip.tabs.findIndex((tab) => tab.path === path);

/** The strip with `tab` recorded over the entry for its own path. A path with no entry is left out:
 *  what the strip holds is decided by the open/close rules below, never by a snapshot. */
export const withTab = (strip: TabStrip, tab: FilesTabState): TabStrip => ({
  ...strip,
  tabs: strip.tabs.map((entry) => (entry.path === tab.path ? tab : entry)),
});

/** A plain open: the file takes the front tab's place, as it took the one open file's place before
 *  tabs existed. A path that already has a tab is brought to the front instead of opened twice. */
export function openedInFront(strip: TabStrip, path: string): TabStrip {
  if (indexOf(strip, path) >= 0) return { ...strip, activePath: path };
  const front = indexOf(strip, strip.activePath);
  if (front < 0) return { tabs: [...strip.tabs, { path }], activePath: path };
  return { tabs: strip.tabs.map((tab, i) => (i === front ? { path } : tab)), activePath: path };
}

/** An open that asked for a tab of its own: placed just after the front tab, where the reader's
 *  eye already is. At the cap it falls back to a plain open rather than dropping another tab. */
export function openedInNewTab(strip: TabStrip, path: string): TabStrip {
  if (indexOf(strip, path) >= 0 || strip.tabs.length >= MAX_TABS) return openedInFront(strip, path);
  const front = indexOf(strip, strip.activePath);
  const at = front < 0 ? strip.tabs.length : front + 1;
  return { tabs: [...strip.tabs.slice(0, at), { path }, ...strip.tabs.slice(at)], activePath: path };
}

/** The tab that takes the front when `path` closes: its right neighbour, or its left when it was the
 *  last. Null when it was the only tab, or is not in the strip. */
export function neighbourOf(strip: TabStrip, path: string): string | null {
  const at = indexOf(strip, path);
  if (at < 0) return null;
  return strip.tabs[at + 1]?.path ?? strip.tabs[at - 1]?.path ?? null;
}

/** The strip without `path`. Closing the front tab hands the front to `neighbourOf`; closing any
 *  other leaves the front where it is. */
export function closed(strip: TabStrip, path: string): TabStrip {
  const activePath = strip.activePath === path ? neighbourOf(strip, path) : strip.activePath;
  return { tabs: strip.tabs.filter((tab) => tab.path !== path), activePath };
}

/** The tab `step` places from the front, going round at the ends. With none in front, forward starts
 *  at the first tab and back at the last. Null for an empty strip. */
export function steppedPath(strip: TabStrip, step: 1 | -1): string | null {
  const count = strip.tabs.length;
  if (count === 0) return null;
  const front = indexOf(strip, strip.activePath);
  const firstFromNowhere = step > 0 ? 0 : count - 1;
  const at = front < 0 ? firstFromNowhere : (front + step + count) % count;
  return strip.tabs[at]?.path ?? null;
}

const segments = (path: string): string[] => path.split("/");

/** What each tab says: the file's name, and its parent too when another open file shares the name —
 *  two `index.ts` tabs are otherwise the same word twice. The full path is in the tab's tooltip. */
export function tabLabels(paths: string[]): string[] {
  const names = paths.map((path) => segments(path).at(-1) ?? path);
  return paths.map((path, i) => {
    const shared = names.filter((name) => name === names[i]).length > 1;
    return shared ? segments(path).slice(-2).join("/") : (names[i] ?? path);
  });
}
