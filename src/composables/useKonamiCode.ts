import { onBeforeUnmount } from "vue";
import { advanceKonami } from "./konamiCode";
import { fireConfettiFinale } from "./useConfetti";

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

/** Up up down down left right left right b a — and the page throws every kind of celebration at
 *  once. Keys typed into a field are not counted: a terminal is a field too, so shell history
 *  and a prompt cannot set it off by accident. */
export function useKonamiCode(): void {
  let progress = 0;
  const onKeydown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) return;
    const next = advanceKonami(progress, event.key);
    progress = next.progress;
    if (next.done) fireConfettiFinale();
  };
  window.addEventListener("keydown", onKeydown);
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
}
