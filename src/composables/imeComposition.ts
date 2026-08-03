// Whether the key that just arrived is confirming an IME candidate, for the handlers that see a
// keystroke WITHOUT owning the field it was typed into: xterm's custom key handler and the grid's
// window-level shortcut listener.
//
// Those paths already refuse `event.isComposing`, which is correct on Chrome and Firefox. It is not
// enough on Safari, which fires `compositionend` BEFORE the confirming keydown — by then the flag is
// false, and the keystroke that was only meant to accept 変換 gets sent to the pty or run as a
// shortcut (#1353). The tracking that closes that gap needs composition events over time, which a
// pure `(keymap, event)` function cannot see, so it lives here and the call sites ask.
//
// Module-level rather than per-consumer: the two consumers must agree about one composition, and it
// belongs to the document, not to either of them.
import { useImeAwareEnter } from "./useImeAwareEnter";

// The Enter callback is unused — this consumer wants only the composition tracking and the
// predicate. Reusing the composable rather than restating the rule keeps ONE definition of "is this
// an IME confirmation", which is the part that is easy to get subtly wrong twice.
const shared = useImeAwareEnter(() => {});

if (typeof window !== "undefined") {
  // Capture, because xterm binds its own listeners on the helper textarea and the grid's shortcut
  // handler already listens in capture — the flag has to be set before either of them reads it.
  window.addEventListener("compositionstart", shared.onCompositionStart, true);
  window.addEventListener("compositionend", shared.onCompositionEnd, true);
}

/** True while an IME candidate is open, and for a moment after Safari closes one. */
export const isImeConfirming = (event: KeyboardEvent): boolean => shared.isImeConfirmation(event);

/** Test seam: drop any composition state, as a real blur would. */
export const resetImeComposition = (): void => shared.onBlur();
