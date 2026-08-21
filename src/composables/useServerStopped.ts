// Whether this page's server has been stopped from the browser (#1820).
//
// Module-level rather than an emit chain: the button lives four components deep
// (App -> GridView -> AppSettingsModal -> SettingsModal -> QuitSection) and the two things that
// have to react to it are the PAGE — the overlay at the app root, and the close guard. Threading
// one boolean through four `defineEmits` would put the fact in four files that do not care about it.
//
// ONE-WAY on purpose: nothing clears it, because there is no server left to tell us otherwise.
import { computed, ref, type ComputedRef } from "vue";

const stopped = ref(false);

export const serverStopped: ComputedRef<boolean> = computed(() => stopped.value);

export const markServerStopped = (): void => {
  stopped.value = true;
};
