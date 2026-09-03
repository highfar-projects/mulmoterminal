// The cockpit roster's own poll, and the list-mode flag that decides whether it runs.
//
// Out of GridView.vue because the two are one mechanism and reading them apart is what makes them
// easy to break: the roster is the poll's SOLE consumer, so every rule here is "poll exactly while
// the roster is on screen" — and each of the three ways it can leave the screen (un-zoom, flip to
// the thumbnail strip, a full-screen overlay taking the route) is a separate signal that has to be
// wired, with no single lifecycle hook covering them. GridView keeps the refresh itself, which is
// about what the roster shows; this keeps when to ask for it.
import { onBeforeUnmount, ref, watch, type Ref } from "vue";

const ROSTER_POLL_MS = 4000;

export interface RosterPoll {
  /** Roster (true) vs the thumbnail filmstrip (false); both are ZOOMED states. */
  listModeOn: Ref<boolean>;
  toggleListMode: () => void;
}

/**
 * @param refresh   what one tick asks for — GridView's own re-seed of the roster's rows.
 * @param expandedUid  the zoomed cell, or null when the tiled grid is showing.
 * @param onRoute   whether the grid is the route being displayed; watched, so it must READ
 *                  reactive state rather than close over a snapshot of it.
 */
export function useRosterPoll(refresh: () => void, expandedUid: Ref<number | null>, onRoute: () => boolean): RosterPoll {
  let rosterTimer: ReturnType<typeof setInterval> | null = null;
  // The roster is shown only while zoomed AND in list mode (the grid can be zoomed into the
  // thumbnail strip instead).
  const listModeOn = ref(true);
  const rosterVisible = () => expandedUid.value !== null && listModeOn.value;

  const startPoll = () => {
    if (!rosterVisible() || rosterTimer !== null) return;
    refresh();
    rosterTimer = setInterval(refresh, ROSTER_POLL_MS);
  };
  const stopPoll = () => {
    if (rosterTimer !== null) clearInterval(rosterTimer);
    rosterTimer = null;
  };
  const syncPoll = () => (rosterVisible() ? startPoll() : stopPoll());

  // immediate: a reload that restores a zoomed grid sets expandedUid up front (no "change"
  // to react to), so start here too, or the roster would freeze at its first snapshot.
  watch(expandedUid, syncPoll, { immediate: true });

  // Follows the ROUTE, not the lifecycle. The grid is the only view now, so it is mounted for the
  // life of the page and never deactivates — but it still goes off screen under a full-screen
  // overlay, and polling the roster nobody can see is the same waste the deactivate hook used to
  // avoid.
  watch(onRoute, (onGrid) => (onGrid ? startPoll() : stopPoll()), { immediate: true });
  onBeforeUnmount(stopPoll);

  // The header's view toggle (shown only while zoomed) flips roster / thumbnail strip; the poll
  // follows since the roster is its sole consumer.
  const toggleListMode = () => {
    listModeOn.value = !listModeOn.value;
    syncPoll();
  };

  return { listModeOn, toggleListMode };
}
