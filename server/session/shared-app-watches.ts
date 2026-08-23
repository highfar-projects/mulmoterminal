// A shared-app watch, from the terminal's side: what is being watched for each session, when a
// change may be typed into it, and what that line is allowed to say.
//
// THE SUBSCRIPTION IS THE EASY HALF (server/backends/sharedApp/participate/watch.ts). This file is
// the part that touches a live PTY on somebody else's schedule, and all three of its rules exist
// because of that.
//
//   1. THE MESSAGE CARRIES NO DATA FROM THE APP. It says a collection changed and how many rows;
//      it never says which, or what they now hold. Everywhere else in `useSharedApp` a stranger's
//      words reach the model as the RESULT OF A CALL THE AGENT CHOSE TO MAKE, through `quoted.ts`.
//      A watch inverts that: a write by somebody the user has never met produces text in the
//      position where the USER types. Handing that channel an app's own strings would let a
//      publisher choose, at a time of their choosing, what arrives as an instruction. So the line
//      is ours, it is a fixed shape, and the only thing an app contributes to it is the slug and
//      collection id the agent already had -- quoted and capped like everything else.
//
//   2. IT NEVER TYPES INTO A DIALOG, AND NEVER OVER SOMEBODY'S TYPING. Mid-turn text is queued by
//      the agent and harmless; text arriving while a permission prompt is open is a keystroke in a
//      dialog, and text arriving while the user is halfway through a sentence is submitted merged
//      with it. Both are held for quiet rather than risked -- see `deliverable`.
//
//   3. A DEAD WATCH SAYS SO. A rule closing, the app being unpublished, the session being reaped:
//      an agent that believes it is subscribed and is not will wait forever, which is worse than
//      never having watched. The end is delivered as its own line.
//
// SAME SESSION ONLY, and nothing is persisted. A watch is a fact about a conversation in progress:
// it dies with the PTY and it dies with this process. Restoring one after a restart would mean a
// stranger's app causing keystrokes in a terminal started hours later, for a conversation that no
// longer remembers asking.
import { subscribeToCollection, type WatchScope } from "../backends/sharedApp/participate/watch.js";
import type { JoinedApp } from "../backends/sharedApp/participate/app.js";
import { quoted } from "../backends/sharedApp/quoted.js";
import { msSinceUserInput } from "./write-to-session.js";
import { activity, ptys } from "./registry.js";

/** How long a burst is allowed to settle into one line. Ten rows written by a script are one thing
 *  that happened, and ten wake-ups for them would cost ten turns to learn it. */
const COALESCE_MS = 1500;

/** How often to look again while the session cannot be typed into. */
const HOLD_MS = 5000;

/** How long the user has to have stopped typing. Long enough to cover the pauses inside a sentence,
 *  short enough that a watch is still worth having. */
const QUIET_MS = 15_000;

/** Watches per session. A ceiling because each one holds live Firestore listeners that bill for as
 *  long as they are attached, and because an agent that wanted more than this has misunderstood the
 *  tool -- a watch is for the thing you are waiting on, not for an app's whole surface. */
const MAX_WATCHES = 8;

interface Watch {
  id: number;
  sessionId: string;
  slug: string;
  cid: string;
  scope: WatchScope;
  stop: () => void;
  /** The DISTINCT RECORDS changed since the last line was delivered, by id.
   *
   *  A set rather than a count, because the same record can be reported twice: an own-row watch has
   *  one listener per identity and a row carrying both matches both, and two edits to one row inside
   *  a coalescing window are two reports of one record. The line says how many RECORDS changed, so
   *  it has to be able to tell one row from two (Codex on #1844).
   *
   *  THE IDS GO NO FURTHER THAN THIS FIELD. Only `size` is ever read, and never the members — an id
   *  is a string somebody else chose, and rule 1 above is that none of those reach the terminal. */
  pending: Set<string>;
  timer: NodeJS.Timeout | null;
  /** Detached — by `unwatch`, by the session ending, or by its subscription dying.
   *
   *  Belt and braces over the unsubscribe. Detaching a listener is asynchronous at the edges, and a
   *  callback already in flight can still land afterwards; without this it would re-arm a timer on a
   *  watch nothing can reach, against a session that in the reap case no longer exists. Nothing
   *  would ever deliver it — `deliverable` says no forever with no PTY — so it would sit there
   *  rescheduling itself for the life of the process. */
  stopped: boolean;
  /** The outcome of its setup, while that is still in flight. Null once it is running.
   *
   *  A RESERVATION IS NOT A RUNNING WATCH, and the difference is only visible from here. The entry
   *  has to go into the map before the subscription is awaited (see below), which makes a pending
   *  watch look exactly like a live one to a second caller — and that caller was told "already
   *  watching, and it has missed nothing" for a subscription that could still turn out to be
   *  refused, leaving it certain of a watch that does not exist (Codex on #1844). So a second caller
   *  WAITS FOR THE FIRST and is given the same answer it got. */
  starting: Promise<StartResult> | null;
}

/** Type into a session, resolving the sender only when there is something to type.
 *
 *  DYNAMIC ON PURPOSE. `session-input.js` reaches the host's live config, which LOADS ITSELF when
 *  its module is first evaluated -- and this file is reached from `useSharedApp`, whose dispatch
 *  route is mounted by anything that mounts the plugin routes. A static import would drag the
 *  config loader, and the PTY tables behind it, into the module graph of every one of those,
 *  including tests that have no host at all (it broke one: `worker-failure-wiring.spec.ts`).
 *
 *  Deferring it costs one cached module resolution the first time a watch actually fires, which is
 *  minutes after the tool call that started it and never at all for a watch nothing changes. */
const deliver = async (sessionId: string, text: string): Promise<void> => {
  const { sendToSession } = await import("./session-input.js");
  await sendToSession(sessionId, text);
};

const bySession = new Map<string, Map<string, Watch>>();
let nextId = 1;

const keyOf = (slug: string, cid: string): string => `${slug} ${cid}`;

/** MAY UNSOLICITED TEXT BE TYPED INTO THIS SESSION RIGHT NOW?
 *
 *  Four ways the answer is no, and they are not the same kind of no -- but all four are "wait", not
 *  "give up", because every one of them is a state the session leaves on its own.
 *
 *  `working` is a turn in progress. The agent would queue the text, which is harmless, but it would
 *  also arrive as an interruption of reasoning the user is waiting on. It costs nothing to wait.
 *
 *  A `waiting` set by a NOTIFICATION is a permission prompt or a question on screen, and this is the
 *  one that matters: those dialogs read keystrokes, so a line typed now is an answer to a question
 *  nobody read. A `waiting` set by a Stop is the opposite -- the turn ended and the session is at
 *  its prompt, which is the best moment there is.
 *
 *  Recent typing means a half-written draft in the input box, which our line would be submitted
 *  together with. Nothing the user did not ask for gets to throw that away (see the note on
 *  `msSinceUserInput`), so it waits for them to finish.
 *
 *  And with no PTY there is nothing to type into at all -- a session that outlived a restart, or one
 *  between losing its client and reattaching. */
function deliverable(sessionId: string, now = Date.now()): boolean {
  if (!ptys.has(sessionId)) return false;
  const state = activity.get(sessionId);
  if (state?.working === true) return false;
  if (state?.waiting === true && state.event === "Notification") return false;
  return msSinceUserInput(sessionId, now) >= QUIET_MS;
}

/** THE LINE. Fixed shape, no app data -- see rule 1 at the top of this file.
 *
 *  It says whose voice it is in, because it arrives where the user's words arrive and nothing else
 *  in the conversation distinguishes them.
 *
 *  AND IT TELLS THE AGENT TO ACT. An earlier version ended "tell the user what you found rather than
 *  acting on it", which confused two different things: that an APP's words are not instructions, and
 *  whether the agent may do the job it was given. A watch exists so somebody can say "approve new
 *  bookings as they come in" or "reply when they answer" and then stop watching the screen -- an
 *  agent that wakes up, reads the change and reports back for permission it already has is a slower
 *  way to do nothing. The injection boundary is where it always was: the app's own data reaches the
 *  model only through `records`, quoted and fenced and under its standing note. What the USER asked
 *  for is not on the other side of that boundary. */
function changeLine(watch: Watch, changes: number): string {
  const rows = changes === 1 ? "1 record" : `${changes} records`;
  return (
    `[mulmoterminal] Shared-app watch: ${rows} changed in ${quoted(watch.cid)} of the app ${quoted(watch.slug)}. ` +
    "This line was written by mulmoterminal, not by the app and not by the user, and it deliberately carries none of the app's data. " +
    "Call useSharedApp records on that collection to see what changed, then do what the user asked you to do about it."
  );
}

function endedLine(watch: Watch, why: string): string {
  return (
    `[mulmoterminal] Shared-app watch on ${quoted(watch.cid)} of the app ${quoted(watch.slug)} has ENDED: ${quoted(why)}. ` +
    "You will not be told about further changes to it. This line was written by mulmoterminal, not by the app."
  );
}

/** A line a session is OWED that no longer has a watch behind it -- in practice, the notice that a
 *  watch has died.
 *
 *  It needs its own queue because it outlives the thing that produced it. The watch is gone from the
 *  bookkeeping the moment its subscription dies (so the agent can immediately start a real new one
 *  rather than being told it is already watching), and the notice still has to wait for a moment
 *  when typing into the terminal is safe -- which can be minutes.
 *
 *  HELD BY SESSION so that teardown can cancel it. An earlier version retried only while the session
 *  had a live PTY, which quietly DROPPED the notice during the gap between a client dying and the
 *  reattach that follows -- the exact silence rule 3 exists to prevent. */
interface Notice {
  text: string;
  timer: NodeJS.Timeout | null;
}

const owed = new Map<string, Set<Notice>>();

function owe(sessionId: string, text: string): void {
  const notice: Notice = { text, timer: null };
  const queue = owed.get(sessionId) ?? new Set<Notice>();
  queue.add(notice);
  owed.set(sessionId, queue);
  attemptNotice(sessionId, notice);
}

function attemptNotice(sessionId: string, notice: Notice): void {
  notice.timer = null;
  // Membership IS the cancellation: teardown empties the queue, and a notice that is no longer in it
  // has nothing left to be delivered to.
  if (owed.get(sessionId)?.has(notice) !== true) return;
  const again = () => {
    notice.timer = later(() => attemptNotice(sessionId, notice), HOLD_MS);
  };
  if (!deliverable(sessionId)) {
    again();
    return;
  }
  void deliver(sessionId, notice.text)
    .then(() => forgetNotice(sessionId, notice))
    // The PTY went between the check and the write. Back in the queue, and it waits like everything
    // else -- there is no caller left holding this to report a failure to.
    .catch(again);
}

function forgetNotice(sessionId: string, notice: Notice): void {
  const queue = owed.get(sessionId);
  if (!queue) return;
  queue.delete(notice);
  if (queue.size === 0) owed.delete(sessionId);
}

/** A timer that does not hold the process open.
 *
 *  Every timer in this file is a WAIT FOR SOMEBODY ELSE -- a turn to end, a user to stop typing --
 *  and none of them is work the process owes anyone. Left referenced, a watch on a quiet app would
 *  keep node alive after everything else had finished.
 *
 *  `unref` is called defensively because a substituted timer implementation need not have one, and a
 *  crash in the delivery path would take the notice with it. */
function later(run: () => void, ms: number): NodeJS.Timeout {
  const timer = setTimeout(run, ms);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

const armed = (watch: Watch, ms: number): void => {
  if (watch.stopped) return;
  // NOT re-armed while one is pending: a steady trickle of changes would push the timer forward
  // forever and the agent would never be told about any of them.
  if (watch.timer !== null) return;
  watch.timer = later(() => flush(watch), ms);
};

function flush(watch: Watch): void {
  watch.timer = null;
  if (watch.stopped || watch.pending.size === 0) return;
  if (!deliverable(watch.sessionId)) {
    armed(watch, HOLD_MS);
    return;
  }
  const taken = watch.pending;
  watch.pending = new Set();
  void deliver(watch.sessionId, changeLine(watch, taken.size)).catch(() => {
    // Put them back rather than dropping them -- anything that arrived in the meantime merges with
    // them, which is what coalescing means, and the union is still one record per id.
    for (const id of taken) watch.pending.add(id);
    armed(watch, HOLD_MS);
  });
}

export type StartResult = { started: true; id: number; scope: WatchScope } | { started: "already"; id: number } | { started: false; why: string };

/** Begin watching one collection on behalf of one session.
 *
 *  THE ENTRY IS RESERVED BEFORE THE AWAIT, and the id is taken before it too. Setting up a
 *  subscription is asynchronous, so two calls can be inside this function at once -- two tool calls
 *  in one turn, or a retry over a slow one. Registering only on the way out let both of them pass
 *  the "already watching" check and attach their own listeners, and then the second `set` overwrote
 *  the first: its `stop` was the only reference anything held, so ITS LISTENERS LEAKED for the life
 *  of the process, billing the app's owner for a watch nobody could see or cancel. Both would also
 *  have reported the same id, since `nextId` was read before the await and advanced after it. */
export async function startWatch(sessionId: string, app: JoinedApp, cid: string): Promise<StartResult> {
  // A WATCH NEEDS A TERMINAL, and this is where that is required rather than assumed. The route
  // checks that the id is well formed; only the PTY table knows whether it names anything. A watch
  // on a session that is not running could never deliver, and nothing would ever reap it — the
  // teardown that detaches listeners hangs off a real session ending, so one attached on behalf of a
  // session that never existed holds its Firestore listeners, billed to the app's owner, until the
  // process restarts. The per-session ceiling is no help either: it is per session, and a caller
  // inventing a new id each time is never twice in the same one (Codex on #1844).
  if (!ptys.has(sessionId)) {
    return { started: false, why: "there is no live terminal for this session on this host, so a change could never be delivered to it" };
  }
  const watches = bySession.get(sessionId) ?? new Map<string, Watch>();
  const key = keyOf(app.slug, cid);
  const existing = watches.get(key);
  // ALREADY WATCHING IS NOT AN ERROR AND NOT A NO-OP TO HIDE. Told it started, an agent would
  // reasonably conclude the previous one had stopped; told nothing, it would double-count. So the
  // existing watch is named and kept -- replacing it would drop changes in the gap.
  if (existing) return joinExisting(existing);
  if (watches.size >= MAX_WATCHES) {
    return { started: false, why: `this session is already watching ${MAX_WATCHES} collections, which is the most it may -- stop one first` };
  }

  const watch: Watch = {
    id: nextId,
    sessionId,
    slug: app.slug,
    cid,
    scope: "all",
    stop: () => {},
    pending: new Set(),
    timer: null,
    stopped: false,
    starting: null,
  };
  nextId += 1;
  watches.set(key, watch);
  bySession.set(sessionId, watches);
  // ASSIGNED WITHOUT YIELDING. Calling an async function runs its body up to its first await and
  // then hands back the promise, so nothing else gets to look at this entry before `starting` is on
  // it -- which is what makes the reservation and its outcome one indivisible thing.
  const setup = beginWatch(watch, app, cid, key);
  watch.starting = setup;
  try {
    return await setup;
  } finally {
    watch.starting = null;
  }
}

/** What a second caller gets for a watch that is already there.
 *
 *  If it is RUNNING, "already". If it is still starting, the same answer the first caller will get:
 *  its success reads as "already" from here, and its failure is passed through as itself, because a
 *  caller told a watch is running when its setup was refused would wait forever on it. */
async function joinExisting(existing: Watch): Promise<StartResult> {
  if (existing.starting === null) return { started: "already", id: existing.id };
  const outcome = await existing.starting;
  return outcome.started === true ? { started: "already", id: outcome.id } : outcome;
}

async function beginWatch(watch: Watch, app: JoinedApp, cid: string, key: string): Promise<StartResult> {
  const sessionId = watch.sessionId;
  const subscribed = await subscribeToCollection(
    app,
    cid,
    (ids) => {
      for (const id of ids) watch.pending.add(id);
      armed(watch, COALESCE_MS);
    },
    (why) => {
      // ALREADY DETACHED IS NOT NEWS. `unwatch` has told the agent, or the session is gone; either
      // way an error queued before that is about a watch nobody is waiting on.
      if (watch.stopped) return;
      // AND THE DROP IS BY IDENTITY. `key` names a slot, not this watch: an error already in flight
      // when `unwatch` ran can land after the same session has started a REPLACEMENT for the same
      // collection, and an unqualified drop would delete that replacement without calling its
      // `stop` -- leaving a live Firestore listener nothing can reach or detach, billed to the
      // app's owner until the process restarts (Codex on #1844).
      //
      // The bookkeeping goes BEFORE the notice, so a `watch` issued after reading it starts a real
      // new one rather than being told it is already on.
      dropWatch(sessionId, key, watch);
      owe(sessionId, endedLine(watch, why));
    },
  ).catch((err: unknown) => {
    dropWatch(sessionId, key);
    throw err;
  });
  if (!subscribed.ok) {
    dropWatch(sessionId, key);
    return { started: false, why: subscribed.why };
  }

  watch.scope = subscribed.handle.scope;
  watch.stop = subscribed.handle.stop;
  // THE RESERVATION CAN HAVE GONE while we waited: the session was reaped, or the subscription died
  // before it was ever handed back. Detached here rather than stored, because putting it back would
  // resurrect a watch on a session that has already been told everything it will ever be told.
  //
  // ASKED OF `bySession`, NOT OF THE CAPTURED MAP, and `stopped` is asked as well. A teardown drops
  // the session's whole entry, after which the next `watch` builds a FRESH map — so the map this
  // call is holding can still contain this reservation while being orphaned, and a check against it
  // would say the watch is registered when nothing can reach it. Its listener would then never be
  // detached: `stop` is stored on an object no teardown will ever walk, which is the leak the
  // reservation was added to prevent, one step further along.
  if (watch.stopped || bySession.get(sessionId)?.get(key) !== watch) {
    subscribed.handle.stop();
    return { started: false, why: "the session ended while the watch was being set up" };
  }
  return { started: true, id: watch.id, scope: watch.scope };
}

/** Remove the watch registered under `key`, or nothing.
 *
 *  `only` narrows that to one particular watch. A key names a SLOT, and the same session can fill it
 *  again after emptying it -- so a caller holding a watch from before must say which one it means,
 *  or it will remove a stranger's. */
function dropWatch(sessionId: string, key: string, only?: Watch): Watch | null {
  const watches = bySession.get(sessionId);
  const watch = watches?.get(key);
  if (!watches || !watch) return null;
  if (only !== undefined && watch !== only) return null;
  watches.delete(key);
  if (watches.size === 0) bySession.delete(sessionId);
  if (watch.timer !== null) clearTimeout(watch.timer);
  watch.timer = null;
  watch.stopped = true;
  return watch;
}

export type StopResult = { stopped: true; id: number; dropped: number } | { stopped: false };

/** Stop one watch. `dropped` is what it had seen but not yet had a chance to say. */
export function stopWatch(sessionId: string, slug: string, cid: string): StopResult {
  const watch = dropWatch(sessionId, keyOf(slug, cid));
  if (watch === null) return { stopped: false };
  watch.stop();
  return { stopped: true, id: watch.id, dropped: watch.pending.size };
}

/** Every watch this session holds, for a report. */
export const watchesFor = (sessionId: string): { slug: string; cid: string; id: number; scope: WatchScope }[] =>
  [...(bySession.get(sessionId)?.values() ?? [])].map(({ slug, cid, id, scope }) => ({ slug, cid, id, scope }));

/** The session has ended. Detach everything it was holding.
 *
 *  No notice is delivered: there is nothing left to deliver it to, which is the whole difference
 *  between this and a watch that dies while its session lives. */
export function stopWatchesFor(sessionId: string): void {
  for (const notice of owed.get(sessionId) ?? []) {
    if (notice.timer !== null) clearTimeout(notice.timer);
  }
  owed.delete(sessionId);
  const watches = bySession.get(sessionId);
  if (!watches) return;
  for (const watch of watches.values()) {
    if (watch.timer !== null) clearTimeout(watch.timer);
    watch.timer = null;
    watch.stopped = true;
    try {
      watch.stop();
    } catch {
      // Already detached.
    }
  }
  // Emptied as well as dropped. The map can be held by a `startWatch` still inside its await, and a
  // reservation left in it would read as registered to that call's own final check.
  watches.clear();
  bySession.delete(sessionId);
}
