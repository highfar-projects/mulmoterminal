// Keeping the pane's copy of a WATCHING page current, from the records rather than from a clock.
//
// A page that declares `live` is written for `onState` to arrive more than once: mulmoserver
// subscribes to those collections and posts a new state on every change. The pane read once and
// re-read after the AUTHOR's own write — so a chat room previewed here sat still while somebody
// else posted, and the page looked broken in a way the published one is not.
//
// THE LISTENER LIVES HERE, not in the browser. mulmoserver's runs in the reader's own tab with the
// reader's own credentials; the pane has no Firestore of its own and no credentials — it reads
// through this host, which holds the session (`currentFirestore()`). So this module holds the
// subscription and the route streams what it sees. Nothing is polled: `onSnapshot` fires when the
// records change and at no other time.
//
// ONE LISTENER PER COLLECTION, fanned out to the pages that watch it. Two pages can name the same
// collection and read it differently — `all` for the desk, `own` for the participant — so a change
// is turned into rows per page, by the same `ownsRow` and `capped` the one-shot read uses. Subscribing twice
// would be two listeners billing for one collection and two chances for them to disagree.
import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";

import { appSchemasPath } from "@receptron/sharedapp";

import { isRecord } from "../../../common/isRecord.js";
import type { PreviewDataset, PreviewRecordChange } from "../../../common/sharedAppPreview.js";
import { currentEmail, currentFirestore, currentUid } from "../remoteHost/session.js";
import { capped, ownsRow, previewSharedApp, type PreviewWatch } from "./preview.js";

/** What the caller gets: a way to stop, or the reason there is nothing to watch.
 *
 *  A preview that will not compute is NOT an error here. The pane has already been told why by the
 *  route that draws it; saying it twice would put a second copy of the same problem on screen. */
export type PreviewWatchHandle = { ok: true; watching: string[]; stop: () => void } | { ok: false };

/** The rows of one snapshot, as the page that asked for them sees it. */
const fields = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  return value;
};

const rowsFor = (docs: { id: string; data: () => unknown }[], watch: PreviewWatch, who: { uid: string; email: string }): PreviewDataset => {
  // The id goes ON the record, as the one-shot read does it: the rules use the document id as the
  // record's identity, and a page rendering a list needs it as a field.
  const rows = docs.map((entry) => ({ ...fields(entry.data()), id: entry.id }));
  // The same window the one-shot read takes, through the same function: a listener that delivered
  // the whole collection would quietly UNDO the cap on the first change after the page opened.
  if (watch.want.scope === "all") return capped(watch.want, rows);
  return capped(
    watch.want,
    rows.filter((row) => ownsRow(watch.want, row, who)),
  );
};

/** Watch every collection this app's pages declare `live`, and report each change once per page.
 *
 *  `emit` is called with the collection's CURRENT rows rather than with a diff: the pane holds a
 *  map keyed by page and collection, and replacing one entry is both smaller to reason about and
 *  impossible to apply out of order.
 *
 *  A REFUSED SUBSCRIPTION is silent. The one-shot read already reported the collection as
 *  unreadable and the pane says so; a listener that cannot open adds nothing to that, and throwing
 *  here would take down the watch on every other collection with it. */
export async function watchPreviewRecords(cwd: string, emit: (change: PreviewRecordChange) => void): Promise<PreviewWatchHandle> {
  const preview = await previewSharedApp(cwd);
  if (!preview.ok || preview.watches.length === 0) return { ok: false };
  const uid = currentUid();
  const email = currentEmail();
  if (uid === null || email === null) return { ok: false };

  const who = { uid, email };
  const byCid = new Map<string, PreviewWatch[]>();
  for (const watch of preview.watches) {
    byCid.set(watch.want.cid, [...(byCid.get(watch.want.cid) ?? []), watch]);
  }

  const stops: Unsubscribe[] = [];
  for (const [cid, watches] of byCid) {
    const path = `${appSchemasPath(preview.aid)}/${cid}/items`;
    stops.push(
      onSnapshot(
        collection(currentFirestore(), path),
        (snapshot) => {
          for (const watch of watches) emit({ key: watch.key, cid, rows: rowsFor(snapshot.docs, watch, who) });
        },
        () => undefined,
      ),
    );
  }
  return {
    ok: true,
    watching: [...byCid.keys()],
    stop: () => {
      for (const off of stops) off();
    },
  };
}

/** Hold a stream open until the request closes — WITH THE CLEANUP REGISTERED FIRST, and with the
 *  response begun only once there is something to send.
 *
 *  THE ORDER OF THE CLEANUP. Opening the watch is asynchronous (the preview has to be computed
 *  before there is anything to subscribe to), and a pane that changes page or directory in the
 *  meantime closes the request while that is still running. Registering the close handler
 *  afterwards means the event has already fired by the time anything is listening: the
 *  subscriptions and the heartbeat are created a moment later and nothing ever stops them —
 *  Firestore listeners billing for a reader who has gone, until the server exits. So the handler
 *  goes on FIRST and the watch is handed to it when it exists.
 *
 *  AND NOTHING TO WATCH IS NOT AN EMPTY STREAM. An `EventSource` whose 200 stream ends reconnects,
 *  by design and for ever — so answering "no app here, no `live`, no session" with an opened-then-
 *  ended stream is a client reconnecting every few seconds and a server recomputing the whole
 *  preview each time, which is the poll this feature exists to avoid, arriving through the error
 *  path. `nothing` therefore answers TERMINALLY, before the stream has begun.
 *
 *  Everything it touches is injected, so the ordering can be tested without express or a session. */
export async function holdOpen(deps: {
  onClose: (release: () => void) => void;
  open: () => Promise<PreviewWatchHandle>;
  /** Begin the SSE response. Called once, only when there IS a watch, and never for a request that
   *  has already gone. */
  begin: () => void;
  /** Start the heartbeat; the returned function stops it. */
  beat: () => () => void;
  /** Answer terminally: there is nothing to watch, and the client must not come back for more. */
  nothing: () => void;
}): Promise<void> {
  let stop: (() => void) | null = null;
  let quiet: (() => void) | null = null;
  let gone = false;
  deps.onClose(() => {
    gone = true;
    quiet?.();
    stop?.();
  });
  const watch = await deps.open();
  if (!watch.ok) {
    if (!gone) deps.nothing();
    return;
  }
  if (gone) {
    watch.stop();
    return;
  }
  stop = watch.stop;
  deps.begin();
  quiet = deps.beat();
}
