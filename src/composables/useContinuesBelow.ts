// Whether a text box holds more than it shows below its visible part (#2615). Character rules cannot
// cover every way layout hides text — a run of newlines, or blanks one engine wraps and another hangs —
// so the code-block dialog also says, from the box itself, when the text goes on past what is in view.
import { nextTick, onMounted, onUnmounted, ref, watch, type Ref, type WatchSource } from "vue";

/** Slack for sub-pixel rounding between the three measurements. */
const END_SLACK_PX = 2;

export const continuesBelow = (box: { scrollHeight: number; clientHeight: number; scrollTop: number }): boolean =>
  box.scrollHeight - box.clientHeight - box.scrollTop > END_SLACK_PX;

/** `content` is what the box shows: a change of it is measured again, once it has been laid out. */
export function useContinuesBelow(box: Ref<HTMLElement | undefined>, content: WatchSource<unknown>): Ref<boolean> {
  const below = ref(false);
  const measure = (): void => {
    if (box.value) below.value = continuesBelow(box.value);
  };
  // After the next frame: right after mounting, WebKit has not laid the text out yet and reports it
  // fitting, and a resize observer never fires for text that grows inside a box of fixed size.
  const measureWhenLaidOut = async (): Promise<void> => {
    await nextTick();
    requestAnimationFrame(measure);
  };
  watch(content, () => void measureWhenLaidOut());
  let resized: ResizeObserver | null = null;
  // Held from mounting: by unmount Vue has already cleared the ref, so it could not be reached there.
  let listenedTo: HTMLElement | null = null;
  onMounted(() => {
    measure();
    void measureWhenLaidOut();
    listenedTo = box.value ?? null;
    listenedTo?.addEventListener("scroll", measure, { passive: true });
    if (typeof ResizeObserver === "undefined" || !listenedTo) return;
    resized = new ResizeObserver(measure);
    resized.observe(listenedTo);
  });
  onUnmounted(() => {
    listenedTo?.removeEventListener("scroll", measure);
    resized?.disconnect();
  });
  return below;
}
