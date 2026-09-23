import { onBeforeUnmount, watch, type Ref } from "vue";
import { parseGridState, STATE_KEY, type GridState } from "../components/gridTabs";

/** Keep the grid's persisted state honest across tabs of this same app, which share one key. */
export function useGridTabSync(state: Ref<GridState>, persist: () => void): void {
  // A second tab/window on this same app shares this key, and it keeps running its own
  // reactive updates while backgrounded — so a tab left idle for a while, with an older
  // session id for a cell still in ITS memory, can wake up and overwrite what a tab actually
  // in use just wrote. The user then reconnects to find a cell showing an older conversation
  // than the one they were just in. A hidden tab has nothing to gain from writing (nobody is
  // looking at it), so it simply doesn't: only the visible tab may persist.
  watch(
    state,
    () => {
      if (document.visibilityState === "visible") persist();
    },
    { deep: true },
  );
  // The other half: absorb what a DIFFERENT tab wrote, so this one's own next write (once it
  // becomes visible and something in it changes) starts from the current truth instead of
  // whatever was in memory before. `storage` only fires in tabs that did NOT make the write.
  const onStorageFromOtherTab = (e: StorageEvent) => {
    if (e.key !== STATE_KEY || e.newValue == null) return;
    const next = parseGridState(e.newValue);
    if (next) state.value = next;
  };
  window.addEventListener("storage", onStorageFromOtherTab);
  onBeforeUnmount(() => window.removeEventListener("storage", onStorageFromOtherTab));
}
