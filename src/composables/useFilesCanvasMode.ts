// The Files pane's Canvas mode (#3008): the open file drawn by the plugin view the Canvas uses,
// inside the pane, so the tree stays beside it. The card is built and held here and never written
// to the session's Canvas — every view saves to the file itself, which stays the only truth.
import { computed, ref, shallowRef, watch } from "vue";
import { absoluteUnder, buildCanvasCard, canOpenInCanvas, type CanvasCard, type StoriesRoots } from "./canvasOpenFile";
import type { OpenFile } from "./useOpenFile";
import type { FilesTabs } from "./useFilesTabs";

export interface FilesCanvasModeDeps {
  cwd: () => string | null;
  storiesRoots: () => StoriesRoots;
  /** `savedInPlace` saves the buffer first, since a view reads the file from disk — the same-file
   *  save Preview uses, so a lost race keeps the conflict banner rather than banking the buffer the
   *  way leaving a file does. A refusal to build the card is the server's sentence, on the error line. */
  file: Pick<OpenFile, "openPath" | "savedInPlace" | "fileError">;
  /** `open` may decline to bring a file forward, over unsaved edits it could not save. */
  tabs: Pick<FilesTabs, "open">;
}

/** A card as the plugin views take it: they read `uuid` only through the host, but the type wants one. */
export interface FilesCanvasResult extends CanvasCard {
  uuid: string;
}

/** A new set with `path` in it or out of it — new, so the ref holding it notices. */
const withPath = (paths: ReadonlySet<string>, path: string, on: boolean): Set<string> => {
  const next = new Set(paths);
  if (on) next.add(path);
  else next.delete(path);
  return next;
};

export function useFilesCanvasMode(deps: FilesCanvasModeDeps) {
  const { openPath } = deps.file;
  // Per path, so a tab switched away from and back to comes back as it was left.
  const canvasPaths = ref(new Set<string>());
  const card = shallowRef<FilesCanvasResult | null>(null);
  const active = computed(() => openPath.value !== null && canvasPaths.value.has(openPath.value));
  // Whether a plugin has a view for the open file — its own gates decide, on the path the CARD will
  // carry: under a directory with a dot segment `p.html` passes alone and fails joined, which would
  // be a button that does nothing when pressed.
  const openable = computed(() => canOpenInCanvas(openPath.value ? absoluteUnder(deps.cwd(), openPath.value) : null, deps.storiesRoots()));

  const setMode = (path: string, on: boolean): void => {
    canvasPaths.value = withPath(canvasPaths.value, path, on);
  };

  // A story's card is a round trip of up to 10s, and the front tab can change while it is in flight.
  let generation = 0;
  async function load(path: string): Promise<void> {
    const mine = ++generation;
    card.value = null;
    const result = await buildCanvasCard(absoluteUnder(deps.cwd(), path), deps.storiesRoots());
    if (mine !== generation || openPath.value !== path) return;
    if (result.kind === "card") {
      card.value = { ...result.card, uuid: crypto.randomUUID() };
      return;
    }
    setMode(path, false);
    if (result.kind === "refused") deps.file.fileError.value = result.reason;
  }

  // One watch over both: a toggle moves `active`, a switch between two Canvas-mode tabs moves only
  // the path, and a switch onto one moves both — which two watches would build twice.
  watch(
    [active, openPath],
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
    if (!(await deps.file.savedInPlace())) return false;
    setMode(path, true);
    return true;
  }

  /** The row's "Open in the Canvas": the file comes to the front, then shows in Canvas mode. A switch
   *  refused over unsaved edits leaves another file in front, which is not the one to draw. */
  async function open(path: string): Promise<void> {
    await deps.tabs.open(path);
    if (openPath.value === path) await show(path);
  }

  async function toggle(): Promise<void> {
    const path = openPath.value;
    if (!path) return;
    if (active.value) setMode(path, false);
    else await show(path);
  }

  /** The root is changing: the paths held here are relative to the old one. */
  function reset(): void {
    canvasPaths.value = new Set();
    generation++;
    card.value = null;
  }

  /** A view's `update-result`: kept locally, since the view has already written the file. */
  function onUpdateResult(update: Partial<FilesCanvasResult>): void {
    if (card.value) card.value = { ...card.value, ...update };
  }

  return { active, openable, card, show, open, toggle, reset, onUpdateResult };
}
