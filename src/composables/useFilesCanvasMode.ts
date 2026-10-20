// The Files pane's Canvas mode (#3008): the open file drawn by the plugin view the Canvas uses,
// inside the pane, so the tree stays beside it. The card is built and held here and never written
// to the session's Canvas — every view saves to the file itself, which stays the only truth.
import { computed, ref, shallowRef, watch, type ComputedRef } from "vue";
import { absoluteUnder, buildCanvasCard, canOpenInCanvas, type CanvasCard, type StoriesRoots } from "./canvasOpenFile";
import { canvasNeedsMulmoScript, isMulmoScriptText } from "./mulmoScriptText";
import type { OpenFile } from "./useOpenFile";
import type { FilesTabs } from "./useFilesTabs";

export interface FilesCanvasModeDeps {
  /** Whether this surface may show the Canvas view at all. Checked on every read, so a path held
   *  here — restored from storage, say — never draws on a surface that has no Canvas view. */
  enabled: () => boolean;
  cwd: () => string | null;
  storiesRoots: () => StoriesRoots;
  /** `savedInPlace` saves the buffer first, since a view reads the file from disk — the same-file
   *  save Preview uses, so a lost race keeps the conflict banner rather than banking the buffer the
   *  way leaving a file does. A refusal to build the card is the server's sentence, on the error line. */
  file: Pick<OpenFile, "openPath" | "savedInPlace" | "fileError" | "editor" | "baseVersion">;
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

/** Whether the open file may have a view at all (`contentAllows`), and whether a plugin has one for it
 *  (`openable`). A `.json` may only when it is a MulmoScript (#3137), judged on the text as it was read
 *  from or saved to disk — what the view reads — so a keystroke does not parse the file again. */
function canvasGates(deps: FilesCanvasModeDeps): { contentAllows: ComputedRef<boolean>; openable: ComputedRef<boolean> } {
  const { file } = deps;
  const scriptOnDisk = ref(false);
  watch(
    [file.openPath, file.baseVersion],
    ([path]) => {
      scriptOnDisk.value = path !== null && isMulmoScriptText(file.editor.value?.getDoc() ?? "");
    },
    { immediate: true },
  );
  const contentAllows = computed(() => file.openPath.value === null || !canvasNeedsMulmoScript(file.openPath.value) || scriptOnDisk.value);
  // A plugin's own gates decide, on the path the CARD will carry: under a directory with a dot segment
  // `p.html` passes alone and fails joined, which would be a button that does nothing when pressed.
  const openable = computed(() => {
    const path = file.openPath.value;
    return contentAllows.value && canOpenInCanvas(path ? absoluteUnder(deps.cwd(), path) : null, deps.storiesRoots());
  });
  return { contentAllows, openable };
}

export function useFilesCanvasMode(deps: FilesCanvasModeDeps) {
  const { openPath } = deps.file;
  // Per path, so a tab switched away from and back to comes back as it was left.
  const canvasPaths = ref(new Set<string>());
  const card = shallowRef<FilesCanvasResult | null>(null);
  const { contentAllows, openable } = canvasGates(deps);
  const active = computed(() => deps.enabled() && openPath.value !== null && canvasPaths.value.has(openPath.value) && contentAllows.value);

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

  /** Turn Canvas mode on for `path`, saving the buffer first; false when the save failed, or when
   *  another file came to the front while it was saving — that file was not the one asked about. */
  async function show(path: string): Promise<boolean> {
    if (!(await deps.file.savedInPlace()) || openPath.value !== path) return false;
    setMode(path, true);
    return true;
  }

  /** The row's "Open in the Canvas": the file comes to the front, then shows in Canvas mode. A switch
   *  refused over unsaved edits leaves another file in front, which is not the one to draw. */
  async function open(path: string): Promise<void> {
    await deps.tabs.open(path);
    if (openPath.value === path) await show(path);
  }

  /** Put `path` back on its editor, whether or not it is the file in front. */
  const hide = (path: string): void => setMode(path, false);

  async function toggle(): Promise<void> {
    const path = openPath.value;
    if (!path) return;
    if (active.value) setMode(path, false);
    else await show(path);
  }

  /** Start over with `paths` in the Canvas view — none on a re-root, since the paths held here are
   *  relative to the old root; a remembered pane's own when it is put back. */
  function reset(paths: readonly string[] = []): void {
    canvasPaths.value = new Set(paths);
    generation++;
    card.value = null;
  }

  /** A view's `update-result`: kept locally, since the view has already written the file. */
  function onUpdateResult(update: Partial<FilesCanvasResult>): void {
    if (card.value) card.value = { ...card.value, ...update };
  }

  const has = (path: string): boolean => canvasPaths.value.has(path);
  return { active, openable, card, show, open, hide, toggle, has, reset, onUpdateResult };
}
