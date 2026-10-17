// The view a Files pane beside a cell carries from one file to the next (#3075). Each file keeps its
// own view (a tab's Preview, a path in the Canvas view); this is what a file with no view of its own
// opens in: the one last chosen in that cell's session. Pure, so the rule is testable without a pane.
export const FILES_VIEW_MODES = ["edit", "preview", "canvas"] as const;
export type FilesViewMode = (typeof FILES_VIEW_MODES)[number];
const isFilesViewMode = (value: unknown): value is FilesViewMode => FILES_VIEW_MODES.some((mode) => mode === value);

/** What the reader is looking at: the Canvas view outranks Preview, as the pane draws it. */
export function viewModeOf(view: { showPreview: boolean; showCanvas: boolean }): FilesViewMode {
  if (view.showCanvas) return "canvas";
  return view.showPreview ? "preview" : "edit";
}

/** How a newly opened file comes up, or null to leave it as the pane would open it anyway: on the
 *  editor, or as its own memory says. Only a file with no memory of its own inherits; whether it HAS
 *  the inherited view (Preview of a `.ts`, Canvas of a picture) is the pane's to check once it landed. */
export function inheritedView(mode: FilesViewMode, ownMemory: boolean): { showPreview: boolean; showCanvas: boolean } | null {
  if (ownMemory || mode === "edit") return null;
  return { showPreview: mode === "preview", showCanvas: mode === "canvas" };
}

/** Sessions remembered at most, newest first: a session id is a UUID, and every cell ever opened
 *  would otherwise stay in the store. */
export const VIEW_MODE_SESSIONS_MAX = 50;

type ViewModeEntry = [sessionId: string, mode: FilesViewMode];
export type ViewModeStore = ViewModeEntry[];

const isViewModeEntry = (entry: unknown): entry is ViewModeEntry =>
  Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && entry[0] !== "" && isFilesViewMode(entry[1]);

/** Whatever the string holds, as a store: junk entries are dropped, not the whole store. */
export function parseViewModeStore(raw: string | null): ViewModeStore {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isViewModeEntry).slice(0, VIEW_MODE_SESSIONS_MAX) : [];
  } catch {
    return []; // not JSON at all — a foreign or half-written value
  }
}

export const viewModeFor = (store: ViewModeStore, sessionId: string): FilesViewMode => store.find(([id]) => id === sessionId)?.[1] ?? "edit";

/** `sessionId` moved to the front with `mode`; the oldest dropped past the cap. */
export function withViewMode(store: ViewModeStore, sessionId: string, mode: FilesViewMode): ViewModeStore {
  const entry: ViewModeEntry = [sessionId, mode];
  return [entry, ...store.filter(([id]) => id !== sessionId)].slice(0, VIEW_MODE_SESSIONS_MAX);
}
