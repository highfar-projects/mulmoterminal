// Keeping a WATCHING page current in the preview pane.
//
// A page that declares `live` is written for `onState` to arrive more than once: production
// subscribes to those collections and posts a new state on every change. This pane read the records
// once and refreshed only after the author's OWN write — so a chat room previewed here sat still
// while somebody else posted, which reads as a broken page rather than as a preview that does not
// watch.
//
// WHY A POLL. mulmoserver holds a Firestore listener per watched collection, in the browser, with
// the reader's own credentials. The pane reads through this host's server over HTTP with the
// author's handle; there is no socket here to hang a listener on, and opening one is a much larger
// change than the gap it closes. So the pane asks again — and only while a page that declared
// `live` is the one on screen, so an app that declares none is read exactly as often as before.
import { onScopeDispose, watch } from "vue";

import type { PreviewPage } from "../../common/sharedAppPreview";

/** Chosen against what it is for: an author watching whether their page redraws when somebody else
 *  writes. Fast enough to see it happen while looking at it, slow enough that a pane left open all
 *  afternoon is not a bill. */
export const LIVE_POLL_MS = 4000;

/** Does the page on screen watch anything? Nothing shown yet is no. */
export const watchesRecords = (page: PreviewPage | null): boolean => (page?.live ?? []).length > 0;

/** Re-read while the shown page watches records, and stop when it does not.
 *
 *  HIDDEN WINDOWS ARE SKIPPED rather than stopped: the reason to re-read is that somebody is
 *  looking, and a pane behind another window is a request every four seconds for nobody. The timer
 *  stays so that coming back needs no new one.
 *
 *  `onScopeDispose` rather than `onBeforeUnmount` so this can be called from anywhere a scope
 *  exists, and so a timer cannot outlive the pane that started it. */
export const keepWatchedPageCurrent = (page: () => PreviewPage | null, reread: () => void): void => {
  let timer: number | undefined;
  const stop = () => {
    window.clearInterval(timer);
    timer = undefined;
  };
  watch(
    () => watchesRecords(page()),
    (watching) => {
      stop();
      if (!watching) {
        return;
      }
      timer = window.setInterval(() => {
        if (document.visibilityState === "hidden") {
          return;
        }
        reread();
      }, LIVE_POLL_MS);
    },
    { immediate: true },
  );
  onScopeDispose(stop);
};
