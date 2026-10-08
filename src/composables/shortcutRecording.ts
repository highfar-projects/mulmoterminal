import { computed, ref } from "vue";

// Whether Settings is recording a keystroke for a shortcut (#2619). While it is, the app's own
// capture-phase key handlers stand down (useCaptureKeydown) — they were registered first, so the
// recorder could not otherwise get to the key before a bound action ran.
//
// ONE recorder at a time: starting a second hands the first its cancel, so a key is never saved for
// two actions and the flag can never be left on by a recorder that lost track of itself.
const recording = ref(false);
let cancelOwner: (() => void) | null = null;

export const shortcutRecording = computed(() => recording.value);
export const isRecordingShortcut = (): boolean => recording.value;

/** Become the one recorder; `cancel` is how a later one stops this one. */
export function claimShortcutRecording(cancel: () => void): void {
  const previous = cancelOwner;
  cancelOwner = cancel;
  recording.value = true;
  if (previous && previous !== cancel) previous();
}

/** Stop recording, if `cancel` is still the recorder that owns it. */
export function releaseShortcutRecording(cancel: () => void): void {
  if (cancelOwner !== cancel) return;
  cancelOwner = null;
  recording.value = false;
}

/** Test seam, and for a caller that must end recording whoever owns it. */
export const setShortcutRecording = (on: boolean): void => {
  if (!on) cancelOwner?.();
  cancelOwner = null;
  recording.value = on;
};
