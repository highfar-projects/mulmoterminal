// The Files pane's side-by-side view of a Markdown file (#2577): the editor on the left, the Preview
// on the right, and the Preview kept at the heading the editor is under.
//
// By heading, not by line: the Preview is a document the pane cannot read into (an opaque origin),
// and headings are the one thing both sides can name — the outline's jump (#2576) already takes the
// Preview to one. The Preview shows the file as saved, so an edit reaches it on the next save.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { MdPreviewScroll } from "./useMdPreviewScroll";
import type { OpenFile } from "./useOpenFile";
import { currentHeadingIndex, headingOccurrence, markdownOutline } from "../components/markdownOutline";

/** How long the editor sits still before the Preview follows: a scroll is a burst of events. */
const FOLLOW_MS = 150;

export interface SideBySideDeps {
  file: Pick<OpenFile, "openPath" | "previewKind" | "unpreviewable" | "showPreview" | "editor" | "togglePreview">;
  editorHost: Ref<HTMLElement | undefined>;
  preview: Pick<MdPreviewScroll, "goToHeading" | "onReady">;
}

export interface SideBySide {
  /** Both halves are on screen. */
  active: ComputedRef<boolean>;
  toggle: () => Promise<void>;
  /** The editor's classes — on the left, in equal halves with the Preview, while side by side. */
  editorClass: ComputedRef<string>;
  previewClass: ComputedRef<string>;
}

export function useSideBySide(deps: SideBySideDeps): SideBySide {
  const { file } = deps;
  const on = ref(false);
  const available = (): boolean => !!file.openPath.value && file.previewKind.value === "markdown" && !file.unpreviewable.value;
  const active = computed(() => on.value && available() && !file.showPreview.value);
  // The heading last sent, so a scroll within one section does not send it again.
  let followed: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function follow(): void {
    if (!active.value) return;
    const editor = file.editor.value;
    const headings = markdownOutline(editor?.getDoc() ?? "");
    const index = currentHeadingIndex(headings, editor?.topLine() ?? null);
    const heading = index === null ? undefined : headings[index];
    if (index === null || !heading) return;
    const key = `${index}:${heading.text}`;
    if (key === followed) return;
    followed = key;
    deps.preview.goToHeading(index, heading.text, headingOccurrence(headings, index));
  }

  const onScroll = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(follow, FOLLOW_MS);
  };

  // Decided on what is on screen, not on the switch: after the Preview was chosen alone the switch is
  // still on, and a press must bring both halves back rather than turn off something not shown.
  async function toggle(): Promise<void> {
    if (active.value) {
      on.value = false;
      return;
    }
    if (file.showPreview.value) await file.togglePreview();
    on.value = true;
  }

  // Both halves just came up, or the Preview document was (re)loaded — a file switch, a save — and
  // answered with the place it remembered: either way it is sent the editor's heading afresh.
  const refollow = (): void => {
    followed = null;
    if (active.value) void nextTick(follow);
  };
  watch(active, refollow);
  deps.preview.onReady(refollow);

  // Capture, because the editor scrolls an element inside the host and `scroll` does not bubble.
  onMounted(() => deps.editorHost.value?.addEventListener("scroll", onScroll, true));
  onBeforeUnmount(() => {
    deps.editorHost.value?.removeEventListener("scroll", onScroll, true);
    if (timer) clearTimeout(timer);
  });
  const editorClass = computed(() => `files-editor min-w-0 flex-auto overflow-hidden${active.value ? " order-first basis-0" : ""}`);
  // `min-w-0` because an iframe's automatic minimum is its intrinsic width, which would take the
  // squeeze in a narrow pane out of the editor alone.
  const previewClass = computed(() => (active.value ? "min-w-0 basis-0 border-l border-border" : ""));
  return { active, toggle, editorClass, previewClass };
}
