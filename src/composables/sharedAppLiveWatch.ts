// Keeping a WATCHING page current in the preview pane.
//
// A page that declares `live` is written for `onState` to arrive more than once: production
// subscribes to those collections and posts a new state on every change. This pane read the records
// once and re-read only after the author's OWN write — so a chat room previewed here sat still
// while somebody else posted, which reads as a broken page rather than as a preview that does not
// watch.
//
// PUSHED, NOT POLLED. The listener is a real `onSnapshot`, held by this host's server, which is
// where the Firestore session lives (`previewWatch.ts`); what arrives here is one collection's rows
// for one page, when they change and at no other time. A clock would have been fewer lines and the
// wrong thing: reads nobody asked for while nothing happens, and a page that is wrong for as long
// as the interval between them.
import { onScopeDispose, watch } from "vue";

import { isRecord } from "../../common/isRecord";
import type { PreviewPage, PreviewRecordChange } from "../../common/sharedAppPreview";

/** Does the page on screen watch anything? Nothing shown yet is no. */
export const watchesRecords = (page: PreviewPage | null): boolean => (page?.live ?? []).length > 0;

/** One change, as the pane holds its records: the page's datasets with that collection replaced.
 *
 *  A NEW MAP rather than a mutation. What the pane holds is a `shallowRef`, so nothing inside it is
 *  reactive — writing into the nested object would update the screen for nobody. Pure, and the only
 *  part of this file a test can reach without a server.
 *
 *  A change for a page the pane does not hold is ignored rather than filed: the datasets are keyed
 *  by page, and inventing an entry would put rows under a page that is not there. */
export const withChange = (
  datasets: Record<string, Record<string, Record<string, unknown>[]>>,
  change: PreviewRecordChange,
): Record<string, Record<string, Record<string, unknown>[]>> => {
  const page = datasets[change.key];
  if (page === undefined) return datasets;
  return { ...datasets, [change.key]: { ...page, [change.cid]: change.rows } };
};

/** Several changes, oldest first. What it is FOR is the race with a one-shot read: a re-read
 *  started at T0 answers with rows as they were at T0, so a change that arrived at T1 is undone by
 *  assigning that answer — and Firestore will not send it again, because nothing has changed since.
 *  The changes that landed while the read was in flight are therefore applied on top of it. */
export const withChanges = (
  datasets: Record<string, Record<string, Record<string, unknown>[]>>,
  changes: PreviewRecordChange[],
): Record<string, Record<string, Record<string, unknown>[]>> => changes.reduce(withChange, datasets);

/** The changes that landed while a one-shot read was in flight — PER READ, and nothing at any
 *  other time.
 *
 *  A read answers with the rows as they were when it STARTED, so a change that arrived at T1 is
 *  undone by assigning that answer, and no second snapshot is coming because nothing has changed
 *  since. That is what has to be kept, and it has to be kept for the read that will use it.
 *
 *  ONE BUFFER PER READ, because reads overlap: they are started fire-and-forget by a write, by an
 *  intent and by the pane, and `refresh` supersedes rather than serialises. A single buffer let a
 *  superseded read close the live one's — so a change caught during the read that was about to land
 *  went missing, which is the bug this whole object exists to prevent, arriving by another door.
 *
 *  What must NOT be kept is everything else. A previewed chat room left open for an afternoon
 *  receives a change per message; holding them against a read that may never come is a list that
 *  only grows. So a buffer exists only between `begin` and its own close, and while it does, a
 *  page's collection holds only its LATEST rows — every change carries the whole collection, so an
 *  older one for the same pair says nothing the newer one does not.
 *
 *  Bounded by the reads actually in flight times what they watch. */
export const pendingChanges = (): {
  begin: () => () => PreviewRecordChange[];
  record: (change: PreviewRecordChange) => void;
} => {
  const reading = new Set<Map<string, PreviewRecordChange>>();
  return {
    begin: () => {
      const held = new Map<string, PreviewRecordChange>();
      reading.add(held);
      let closed = false;
      // IDEMPOTENT: every way out of a read closes it — superseded, refused, threw — so the second
      // call has to be nothing rather than a way to replay these onto another read's answer.
      return () => {
        if (closed) return [];
        closed = true;
        reading.delete(held);
        return [...held.values()];
      };
    },
    record: (change) => {
      for (const held of reading) held.set(`${change.key}|${change.cid}`, change);
    },
  };
};

/** Hold a stream open while the shown page watches records, and let go when it does not.
 *
 *  ONE STREAM FOR THE APP, not one per page: the server subscribes to every collection any page
 *  declares `live` and says which page each change is for, so switching pages in the picker needs
 *  no reconnection. What starts and stops it is whether the page on screen watches ANYTHING —
 *  an app that declares no `live` opens nothing, exactly as before.
 *
 *  `onScopeDispose` so a stream cannot outlive the pane that opened it: an `EventSource` left open
 *  holds a listener on this host and a Firestore subscription behind it.
 */
export const keepWatchedPageCurrent = (page: () => PreviewPage | null, url: () => string, apply: (change: PreviewRecordChange) => void): void => {
  let stream: EventSource | null = null;
  const close = () => {
    stream?.close();
    stream = null;
  };
  watch(
    () => (watchesRecords(page()) ? url() : null),
    (address) => {
      close();
      if (address === null) return;
      stream = new EventSource(address);
      stream.onmessage = (event: MessageEvent<string>) => {
        // Whatever arrives is JSON from this host's own server, and it is narrowed rather than
        // trusted: a shape this pane cannot read must leave the records as they are, not throw
        // inside a handler nobody is awaiting.
        const change = asChange(event.data);
        if (change !== null) apply(change);
      };
    },
    { immediate: true },
  );
  onScopeDispose(close);
};

const asChange = (data: string): PreviewRecordChange | null => {
  const parsed = parsed_(data);
  if (!isRecord(parsed)) return null;
  const { key, cid, rows } = parsed;
  if (typeof key !== "string" || typeof cid !== "string" || !Array.isArray(rows)) return null;
  return { key, cid, rows: rows.filter(isRecord) };
};

/** A heartbeat is a COMMENT and never reaches here; anything else that will not parse is a line
 *  this pane cannot read, and the records stay as they are. */
const parsed_ = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
