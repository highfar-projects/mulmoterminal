import { computed, ref } from "vue";

// Whether Settings is recording a keystroke for a shortcut (#2619). While it is, the app's own
// capture-phase key handlers stand down (useCaptureKeydown) — they were registered first, so the
// recorder could not otherwise get to the key before a bound action ran.
const recording = ref(false);

export const shortcutRecording = computed(() => recording.value);
export const isRecordingShortcut = (): boolean => recording.value;
export const setShortcutRecording = (on: boolean): void => {
  recording.value = on;
};
