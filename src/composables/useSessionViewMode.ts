// The view a session's Files pane last chose, kept in the browser so a reload keeps it (#3075).
// Read when a file is opened rather than held in a ref: nothing draws from it, and two panes for
// two sessions must never share an answer.
import { inheritedView, parseViewModeStore, viewModeFor, viewModeOf, withViewMode, type FilesViewMode } from "../components/filesViewMode";
import type { InheritedView } from "./useFilesTabs";
import { readStored, writeStored } from "../utils/localStore";

const VIEW_MODE_KEY = "files_view_mode";

export interface SessionViewMode {
  /** The view to open a file with no memory of its own in; "edit" with no session. */
  mode: () => FilesViewMode;
  /** What the reader just chose; nothing is kept with no session. */
  remember: (mode: FilesViewMode) => void;
}

export function useSessionViewMode(sessionId: () => string | null | undefined): SessionViewMode {
  const store = () => parseViewModeStore(readStored(VIEW_MODE_KEY));
  return {
    mode: () => {
      const id = sessionId();
      return id ? viewModeFor(store(), id) : "edit";
    },
    remember: (mode) => {
      const id = sessionId();
      if (id) writeStored(VIEW_MODE_KEY, JSON.stringify(withViewMode(store(), id, mode)));
    },
  };
}

/** The Files pane's half (#3075): what a newly opened file inherits, and the reader's own choices
 *  recorded as they are made. `canvas` is read when a file opens, by which time the pane has one. */
export interface CarriedViewDeps {
  /** The pane's props: the session the view is kept for. The full-screen pane has none, and so
   *  never carries the Canvas view it does not have. */
  props: { viewModeSession?: string | null | undefined };
  file: { showPreview: { readonly value: boolean } };
  canvas: () => {
    has: (path: string) => boolean;
    openable: { readonly value: boolean };
    active: { readonly value: boolean };
    show: (path: string) => Promise<boolean>;
  };
}

export function useCarriedView(deps: CarriedViewDeps): { inherit: InheritedView; choose: (pick: () => Promise<unknown>) => Promise<void> } {
  const session = useSessionViewMode(() => deps.props.viewModeSession);
  const inherit: InheritedView = {
    // A path still in the Canvas view is a memory of its own, as a tab is.
    viewFor: (path) => inheritedView(session.mode(), deps.canvas().has(path)),
    landed: async (path) => {
      if (deps.canvas().openable.value) await deps.canvas().show(path);
    },
  };
  const onScreen = (): FilesViewMode => viewModeOf({ showPreview: deps.file.showPreview.value, showCanvas: deps.canvas().active.value });
  /** A view the reader picked, as against one a restore or a located open put up: only this is what
   *  the next file opens in. A switch refused over a buffer that could not be saved changed nothing,
   *  so nothing is recorded. */
  const choose = async (pick: () => Promise<unknown>): Promise<void> => {
    const before = onScreen();
    await pick();
    const after = onScreen();
    if (after !== before) session.remember(after);
  };
  return { inherit, choose };
}
