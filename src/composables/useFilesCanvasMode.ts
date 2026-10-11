// The Files pane's Canvas mode (#3008): the open file drawn by the plugin view the Canvas uses,
// inside the pane, so the tree stays beside it. The card is built and held here and never written
// to the session's Canvas — every view saves to the file itself, which stays the only truth.
import { computed, ref, shallowRef, watch, type Ref } from "vue";
import { absoluteUnder, buildCanvasCard, canOpenInCanvas, type CanvasCard, type StoriesRoots } from "./canvasOpenFile";

export interface FilesCanvasModeDeps {
  cwd: () => string | null;
  openPath: Ref<string | null>;
  storiesRoots: () => StoriesRoots;
  /** Saves the buffer; false when it could not be, and the view would draw a file without the edits. */
  flush: () => Promise<boolean>;
  /** Opens `path` as the front tab; it may decline, over unsaved edits it could not save. */
  bringToFront: (path: string) => Promise<unknown>;
  /** The server's sentence when it refused to build the card (an unregistered story root, say). */
  refused: (reason: string) => void;
}

/** A card as the plugin views take it: they read `uuid` only through the host, but the type wants one. */
export interface FilesCanvasResult extends CanvasCard {
  uuid: string;
}

export function useFilesCanvasMode(deps: FilesCanvasModeDeps) {
  // Per path, so a tab switched away from and back to comes back as it was left.
  const canvasPaths = ref(new Set<string>());
  const card = shallowRef<FilesCanvasResult | null>(null);
  const active = computed(() => deps.openPath.value !== null && canvasPaths.value.has(deps.openPath.value));
  // Whether a plugin has a view for the open file — its own gates decide, on the path the CARD will
  // carry: under a directory with a dot segment `p.html` passes alone and fails joined, which would
  // be a button that does nothing when pressed.
  const openable = computed(() => canOpenInCanvas(deps.openPath.value ? absoluteUnder(deps.cwd(), deps.openPath.value) : null, deps.storiesRoots()));

  const setMode = (path: string, on: boolean): void => {
    const next = new Set(canvasPaths.value);
    if (on) next.add(path);
    else next.delete(path);
    canvasPaths.value = next;
  };

  // A story's card is a round trip of up to 10s, and the front tab can change while it is in flight.
  let generation = 0;
  async function load(path: string): Promise<void> {
    const mine = ++generation;
    card.value = null;
    const result = await buildCanvasCard(absoluteUnder(deps.cwd(), path), deps.storiesRoots());
    if (mine !== generation || deps.openPath.value !== path) return;
    if (result.kind === "card") {
      card.value = { ...result.card, uuid: crypto.randomUUID() };
      return;
    }
    setMode(path, false);
    if (result.kind === "refused") deps.refused(result.reason);
  }

  // One watch over both: a toggle moves `active`, a switch between two Canvas-mode tabs moves only
  // the path, and a switch onto one moves both — which two watches would build twice.
  watch(
    [active, deps.openPath],
    ([on, path]) => {
      if (on && path) void load(path);
      else {
        generation++;
        card.value = null;
      }
    },
    { immediate: true },
  );

  /** Turn Canvas mode on for `path`, saving the buffer first; false when the save failed. */
  async function show(path: string): Promise<boolean> {
    if (!(await deps.flush())) return false;
    setMode(path, true);
    return true;
  }

  /** The row's "Open in the Canvas": the file comes to the front, then shows in Canvas mode. A switch
   *  refused over unsaved edits leaves another file in front, which is not the one to draw. */
  async function open(path: string): Promise<void> {
    await deps.bringToFront(path);
    if (deps.openPath.value === path) await show(path);
  }

  async function toggle(): Promise<void> {
    const path = deps.openPath.value;
    if (!path) return;
    if (active.value) setMode(path, false);
    else await show(path);
  }

  /** A view's `update-result`: kept locally, since the view has already written the file. */
  function onUpdateResult(update: Partial<FilesCanvasResult>): void {
    if (card.value) card.value = { ...card.value, ...update };
  }

  return { active, openable, card, show, open, toggle, onUpdateResult };
}
