// The Firestore half of a shared-app watch: a live subscription to a collection the reader can
// already read, which reports THAT it changed and nothing about how.
//
// It exists because `useSharedApp` is otherwise a tool an agent can only pull on. An app is a
// place several people write to from several machines, and every interesting thing that happens
// in one — an answer arriving, a row being approved, a slot opening — happens on somebody else's
// schedule. Without this the only way to notice is to call `records` again and hope.
//
// WHAT IT WATCHES IS WHAT THE READER MAY READ, and it works that out by doing a read: `readRecords`
// already holds every rule about which of `all` / `own` / `none` a reader gets and why, including
// the two shapes an own-row query cannot be built for. Reproducing that judgement here would be a
// second answer to the same question, and the two would drift. So the scope is established by one
// real read, and the listeners are then attached along the same path — the collection itself for
// `all`, one query per declared identity for `own`.
//
// A REFUSAL AFTER THE FACT IS NOT AN ERROR TO SWALLOW. A rule can close while a listener is open —
// the roster changes, the app is unpublished — and Firestore reports that through the snapshot's
// error callback, asynchronously, long after `subscribe` returned. A watch that quietly stopped is
// worse than one that never started, because the agent goes on believing it will be told. So the
// last listener to fail ends the watch OUT LOUD, through `onEnded`.
import { collection, doc, FieldPath, onSnapshot, query, where } from "firebase/firestore";
import { currentFirestore } from "../../remoteHost/session.js";
import { itemsPath } from "../itemWrites.js";
import { refused } from "../refused.js";
import { ownSelector, readRecords, type JoinedApp } from "./app.js";

// THERE IS NO ROW WINDOW, and that is a decision rather than an omission.
//
// A `limit(n)` subscription watches the first n documents by id, so on a collection larger than n a
// change beyond it never fires — and the agent cannot tell that apart from nothing having happened.
// A watch whose silence means two different things is not a watch; it is a trap that springs later,
// on exactly the busy app somebody most wanted to be told about. There was a 200-row window here
// once, and this is what was wrong with it.
//
// WHAT IT COSTS, stated because it is real: the first snapshot bills one read per document in the
// collection, once, when the watch is set up. After that a listener bills only what CHANGES, which
// is the same either way — so the window never bounded the ongoing cost, only the initial read, and
// it charged correctness for it. The bound that remains is how many watches one session may hold at
// a time (`MAX_WATCHES` in server/session/shared-app-watches.ts).
//
// Reads are billed to the app's project, not to the reader, which is why this is said out loud in
// the tool's own prompt: a watch spends somebody else's money for as long as it is open.

export type WatchScope = "all" | "own";

export interface WatchHandle {
  scope: WatchScope;
  stop: () => void;
}

export type SubscribeResult = { ok: true; handle: WatchHandle } | { ok: false; why: string };

/** Why a listener stopped, in the reader's terms.
 *
 *  THE SAME DISTINCTION THE READS MAKE, and for the same reason: a rules denial is final and a blip
 *  is not, and an agent told the wrong one of the two either gives up on an app it may still use or
 *  keeps retrying one it may not. */
const failure = (err: unknown): string =>
  refused(err) ? "the rules stopped allowing this read while the watch was open" : `the subscription failed: ${messageOf(err)}`;

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The initial snapshot every listener gets on attach, filtered out.
 *
 *  `onSnapshot` delivers the current contents immediately. Reported as a change, it would wake the
 *  agent to tell it the collection holds what it already read. */
function afterFirst(report: (count: number) => void): (count: number) => void {
  let seenFirst = false;
  return (count: number) => {
    if (!seenFirst) {
      seenFirst = true;
      return;
    }
    report(count);
  };
}

function stopAll(stoppers: (() => void)[]): void {
  for (const stop of stoppers.splice(0)) {
    try {
      stop();
    } catch {
      // Already detached -- a stop is best effort by construction, and there is nothing left to
      // report it to.
    }
  }
}

/** The set of listeners one watch is made of, and the two rules they share.
 *
 *  A watch is not always one subscription: an own-row watch is one per identity the declaration
 *  names, because the rules accept either and watching one would miss half of what is the reader's.
 *  What has to be true of all of them is the same either way, so it is held here rather than at each
 *  attach point -- the first snapshot is not a change, and the LAST listener to die is what ends the
 *  watch. */
function fanout(onChange: (changes: number) => void, onEnded: (why: string) => void) {
  const stoppers: (() => void)[] = [];
  let alive = 0;
  let ended = false;

  const changed = (count: number) => {
    if (ended || count === 0) return;
    onChange(count);
  };

  // A listener that dies takes only itself with it. With two identity queries the rules can close
  // one and leave the other open, and ending the whole watch on the first refusal would stop
  // reporting rows the reader can still see.
  const died = (err: unknown) => {
    alive -= 1;
    if (alive > 0 || ended) return;
    ended = true;
    onEnded(failure(err));
  };

  return {
    attach(build: (report: (count: number) => void, fail: (err: unknown) => void) => () => void): void {
      alive += 1;
      stoppers.push(build(afterFirst(changed), died));
    },
    get alive(): number {
      return alive;
    },
    stop: () => stopAll(stoppers),
  };
}

/** Attach a live subscription to one collection.
 *
 *  `onChange` is called with the number of documents that changed, NEVER with the documents. That is
 *  the feature's central rule and it is enforced here, at the only place the data is in hand: the
 *  snapshot is counted and dropped. See `server/session/shared-app-watches.ts` for why. */
export async function subscribeToCollection(
  app: JoinedApp,
  cid: string,
  onChange: (changes: number) => void,
  onEnded: (why: string) => void,
): Promise<SubscribeResult> {
  // ONE REAL READ decides the scope -- see the note at the top of the file. Its cost is a single
  // document, and what it buys is that a watch can never claim to see more than a read would.
  const probe = await readRecords(app, cid, 1);
  if (probe.scope === "none" || probe.scope === "failed") {
    return { ok: false, why: probe.note ?? "nothing in this collection could be read" };
  }

  const db = currentFirestore();
  const path = itemsPath(app.aid, cid);
  const fan = fanout(onChange, onEnded);

  if (probe.scope === "all") {
    fan.attach((report, fail) => onSnapshot(collection(db, path), (snapshot) => report(snapshot.docChanges().length), fail));
    return { ok: true, handle: { scope: "all", stop: fan.stop } };
  }

  const want = ownSelector(app, cid);
  // `readRecords` already answered `own`, so the selector it used is there. Anything else means the
  // declaration changed between the two, which is a race not worth a second vocabulary -- it reads
  // as a watch that could not be set up.
  if (want === null || want === "unlistable") {
    return { ok: false, why: "your own rows in this collection cannot be watched -- they can only be named one at a time" };
  }

  // One named row. `onSnapshot` on a document reports no change count, and one is what it is.
  if ("id" in want) {
    fan.attach((report, fail) => onSnapshot(doc(db, path, want.id), () => report(1), fail));
    return { ok: true, handle: { scope: "own", stop: fan.stop } };
  }

  for (const field of want.fields) {
    fan.attach((report, fail) =>
      onSnapshot(query(collection(db, path), where(new FieldPath(field.field), "==", field.value)), (snapshot) => report(snapshot.docChanges().length), fail),
    );
  }
  if (fan.alive === 0) return { ok: false, why: "the declaration names no field your own rows could be watched by" };
  return { ok: true, handle: { scope: "own", stop: fan.stop } };
}
