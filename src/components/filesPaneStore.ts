// What the Files pane had open, remembered ACROSS RELOADS and keyed by directory (#958).
//
// The in-memory map beside this one is keyed by cell uid and stays that way: two terminals in
// the same repository is the ordinary case, and during a session each should remember its own
// tree. A uid is not the same number after a reload though, so it cannot be what survives one
// — the directory is. The two layers are read memory-first, so nothing about a live session
// changes; the directory layer only answers when the memory layer is empty, which is exactly
// the first look after a reload.
//
// Pure: no localStorage here. The host reads and writes the string through its own best-effort
// storage helpers, which is also what makes this testable without a DOM.
import type { FilesPaneState, FilesTabState } from "./filesPaneState";
import type { CaretAt } from "./cmEditor";
import { isRecord } from "../../common/isRecord";

export interface RememberedPane {
  cwd: string;
  state: FilesPaneState;
}

/** A caret is two WHOLE numbers and nothing else — a document position is an integer, and a
 *  fractional one is not rejected downstream: it lands on a fractional offset and reads back as a
 *  fractional column, which is then what gets remembered (Codex on #2156). Anything else costs the
 *  CARET — the reader lands at the top of the file they asked for, which is where they landed
 *  before this existed. */
const asCaret = (value: unknown): CaretAt | undefined =>
  isRecord(value) && Number.isInteger(value.line) && Number.isInteger(value.col) && typeof value.line === "number" && typeof value.col === "number"
    ? { line: value.line, col: value.col }
    : undefined;

/** A scroll offset the browser could actually be at. A negative or non-finite one is dropped rather
 *  than clamped: it did not come from a scrollbar, so guessing what it meant helps nobody. */
const asScrollTop = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** A line number the document could actually have: whole, and at least the first line. */
const asLine = (value: unknown): number | undefined => (Number.isInteger(value) && typeof value === "number" && value >= 1 ? value : undefined);

/** Directories kept, newest first. A browser-wide cap: without one this grows for as long as the
 *  user opens new projects, and localStorage answers a quota error by failing the whole write. */
export const MAX_REMEMBERED_DIRS = 20;

/** Expanded paths kept per directory. One pathological tree (a node_modules walked open) would
 *  otherwise be large enough to cost every OTHER directory its entry. */
export const MAX_EXPANDED_PATHS = 200;

/** Tabs kept per directory, for the same reason: a pane left with hundreds open must not cost every
 *  other directory its entry. */
export const MAX_TABS = 50;

/** One tab as it comes back OUT of storage: every field but the path is `unknown`, and a value of
 *  the wrong shape costs that FIELD alone — never the file the reader came back for. It is also a
 *  WHITELIST: a field of `FilesTabState` not named here is dropped on the way into storage, silently
 *  and with the type still claiming it survived. Adding one means adding it here, with its guard. */
const cappedTab = (tab: Record<string, unknown> & { path: string }): FilesTabState => {
  const caret = asCaret(tab.caret);
  const topLine = asLine(tab.topLine);
  const previewScrollTop = asScrollTop(tab.previewScrollTop);
  return {
    path: tab.path,
    showPreview: tab.showPreview === true,
    // Spread rather than assigned: `exactOptionalPropertyTypes` makes an explicit `undefined`
    // different from an absent key, and absent is what "nothing was remembered" means here.
    ...(caret ? { caret } : {}),
    ...(topLine ? { topLine } : {}),
    ...(previewScrollTop === undefined ? {} : { previewScrollTop }),
  };
};

/** A tab names a file. An empty path names none — the one-file shape used it for "nothing open", and
 *  the pane never opens one — so it is no tab. */
const isStoredTab = (value: unknown): value is Record<string, unknown> & { path: string } =>
  isRecord(value) && typeof value.path === "string" && value.path !== "";

/** The tabs a stored state holds. Two shapes are read: a list of tabs, and the ONE open file that
 *  everything written before tabs (#2267) kept at the top level — `openPath` beside the file's own
 *  fields — which becomes a single tab. A tab of the wrong shape is dropped, not the rest. */
const storedTabs = (state: Record<string, unknown>): FilesTabState[] => {
  if (Array.isArray(state.tabs)) return state.tabs.filter(isStoredTab).slice(0, MAX_TABS).map(cappedTab);
  const openFile = { ...state, path: state.openPath };
  return isStoredTab(openFile) ? [cappedTab(openFile)] : [];
};

/** Which tab is in front. The one-file shape names it as `openPath`; a front naming no stored tab
 *  is no front at all. */
const storedActivePath = (state: Record<string, unknown>, tabs: FilesTabState[]): string | null => {
  const named = Array.isArray(state.tabs) ? state.activePath : state.openPath;
  return typeof named === "string" && tabs.some((tab) => tab.path === named) ? named : null;
};

/** A stored pane state, or null when it is not one. `expanded` is required in both shapes, as it
 *  always was; `tabs`, when present, must be a list, and `openPath` must be a string or null. */
const asPaneState = (value: unknown): FilesPaneState | null => {
  if (!isRecord(value)) return null;
  const { openPath, expanded, tabs } = value;
  if (!Array.isArray(expanded) || !expanded.every((p) => typeof p === "string")) return null;
  if (tabs !== undefined && !Array.isArray(tabs)) return null;
  if (tabs === undefined && !(openPath === null || typeof openPath === "string")) return null;
  const kept = storedTabs(value);
  const treeScrollTop = asScrollTop(value.treeScrollTop);
  return {
    tabs: kept,
    activePath: storedActivePath(value, kept),
    expanded: expanded.slice(0, MAX_EXPANDED_PATHS),
    ...(treeScrollTop === undefined ? {} : { treeScrollTop }),
  };
};

interface StoredPane {
  cwd: string;
  state: FilesPaneState;
}

/** A stored entry, its state already capped, or null when it is not one. */
const asRemembered = (value: unknown): StoredPane | null => {
  if (!isRecord(value) || typeof value.cwd !== "string" || value.cwd === "") return null;
  const state = asPaneState(value.state);
  return state ? { cwd: value.cwd, state } : null;
};

/** Read back what was stored. Anything unparseable or the wrong shape is dropped rather than
 *  thrown: this is a convenience, and a bad entry must not cost the user a working pane. */
export function parsePaneStore(raw: string | null): RememberedPane[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(asRemembered)
      .filter((entry): entry is StoredPane => entry !== null)
      .slice(0, MAX_REMEMBERED_DIRS);
  } catch {
    return []; // not JSON at all — a foreign or half-written value
  }
}

/** `store` with `cwd` recorded at the front, its previous entry removed. Newest-first order is
 *  what makes the cap an LRU rather than an arbitrary truncation. */
export function rememberPane(store: RememberedPane[], cwd: string, state: FilesPaneState): RememberedPane[] {
  const kept = asPaneState(state) ?? { tabs: [], activePath: null, expanded: [] };
  return [{ cwd, state: kept }, ...store.filter((entry) => entry.cwd !== cwd)].slice(0, MAX_REMEMBERED_DIRS);
}

/** What this directory had open, or null when it is not remembered. */
export function recallPane(store: RememberedPane[], cwd: string | null): FilesPaneState | null {
  if (!cwd) return null;
  return store.find((entry) => entry.cwd === cwd)?.state ?? null;
}
