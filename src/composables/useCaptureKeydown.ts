import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from "vue";
import { isRecordingShortcut } from "./shortcutRecording";

// A capture-phase `window` keydown listener that is live ONLY while the owning view is on
// screen.
//
// Capture phase, because xterm binds keydown on its own textarea and capture runs first —
// that is the only way to claim a key before the terminal turns it into an escape sequence.
// Which is exactly why the teardown has to be right: a view cached by <KeepAlive> is
// DEACTIVATED, not unmounted, when the user navigates away, so an `onBeforeUnmount`-only
// cleanup would leave the listener swallowing keys in every other view for the rest of the
// session.
//
// Both `onMounted` and `onActivated` attach: `onActivated` never fires for a component that
// isn't under <KeepAlive>, and `onMounted` never fires again on re-activation. Registering
// the same (type, callback, capture) triple twice is a no-op per the DOM spec, so the
// overlap on first mount is harmless.
//
// Every one of them stands down while Settings records a shortcut (#2619): the key being recorded
// is meant for the recorder, and one already bound would otherwise run its action first.
export function useCaptureKeydown(handler: (e: KeyboardEvent) => void): void {
  const guarded = (e: KeyboardEvent): void => {
    if (!isRecordingShortcut()) handler(e);
  };
  const attach = () => window.addEventListener("keydown", guarded, true);
  const detach = () => window.removeEventListener("keydown", guarded, true);
  onMounted(attach);
  onActivated(attach);
  onDeactivated(detach);
  onBeforeUnmount(detach);
}
