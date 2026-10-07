import { onBeforeUnmount } from "vue";
import { advanceKonami } from "./konamiCode";
import { fireConfettiFinale } from "./useConfetti";

/** Up up down down left right left right b a — and the page throws every kind of celebration at once. */
export function useKonamiCode(): void {
  let progress = 0;
  const onKeydown = (event: KeyboardEvent): void => {
    const next = advanceKonami(progress, event.key);
    progress = next.progress;
    if (next.done) fireConfettiFinale();
  };
  window.addEventListener("keydown", onKeydown);
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
}
