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
  /** Changes seen since the last line was delivered. */
  pending: number;
  timer: NodeJS.Timeout | null;
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

/** Type one line into a session once it is safe to, retrying until it is.
 *
 *  `stillWanted` is what stops a retry outliving its reason: a reaped session, or a watch the agent
 *  has since dropped. Without it a held line would keep a timer alive against a conversation that
 *  has ended. */
function deliverEventually(sessionId: string, text: string, stillWanted: () => boolean): void {
  const attempt = () => {
    if (!stillWanted()) return;
    if (!deliverable(sessionId)) {
      later(attempt, HOLD_MS);
      return;
    }
    void deliver(sessionId, text).catch(() => {
      // The PTY went between the check and the write. Not a failure to report to anyone -- there is
      // no caller left holding this -- so it goes back in the queue and waits like everything else.
      later(attempt, HOLD_MS);
    });
  };
  attempt();
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
  // NOT re-armed while one is pending: a steady trickle of changes would push the timer forward
  // forever and the agent would never be told about any of them.
  if (watch.timer !== null) return;
  watch.timer = later(() => flush(watch), ms);
};

function flush(watch: Watch): void {
  watch.timer = null;
  if (watch.pending === 0) return;
  if (!deliverable(watch.sessionId)) {
    armed(watch, HOLD_MS);
    return;
  }
  const changes = watch.pending;
  watch.pending = 0;
  void deliver(watch.sessionId, changeLine(watch, changes)).catch(() => {
    // Put the count back rather than dropping it -- anything that arrived in the meantime is simply
    // added to it, which is what coalescing means.
    watch.pending += changes;
    armed(watch, HOLD_MS);
  });
}

export type StartResult = { started: true; id: number; scope: WatchScope } | { started: "already"; id: number } | { started: false; why: string };

/** Begin watching one collection on behalf of one session. */
export async function startWatch(sessionId: string, app: JoinedApp, cid: string): Promise<StartResult> {
  const watches = bySession.get(sessionId) ?? new Map<string, Watch>();
  const key = keyOf(app.slug, cid);
  const existing = watches.get(key);
  // ALREADY WATCHING IS NOT AN ERROR AND NOT A NO-OP TO HIDE. Told it started, an agent would
  // reasonably conclude the previous one had stopped; told nothing, it would double-count. So the
  // existing watch is named and kept -- replacing it would drop changes in the gap.
  if (existing) return { started: "already", id: existing.id };
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
    pending: 0,
    timer: null,
  };
  const subscribed = await subscribeToCollection(
    app,
    cid,
    (changes) => {
      watch.pending += changes;
      armed(watch, COALESCE_MS);
    },
    (why) => {
      // The subscription is already down; drop the bookkeeping BEFORE the notice, so a `watch`
      // issued after reading it starts a real new one rather than being told it is already on.
      dropWatch(sessionId, key);
      deliverEventually(sessionId, endedLine(watch, why), () => ptys.has(sessionId));
    },
  );
  if (!subscribed.ok) return { started: false, why: subscribed.why };

  nextId += 1;
  watch.scope = subscribed.handle.scope;
  watch.stop = subscribed.handle.stop;
  watches.set(key, watch);
  bySession.set(sessionId, watches);
  return { started: true, id: watch.id, scope: watch.scope };
}

function dropWatch(sessionId: string, key: string): Watch | null {
  const watches = bySession.get(sessionId);
  const watch = watches?.get(key);
  if (!watches || !watch) return null;
  watches.delete(key);
  if (watches.size === 0) bySession.delete(sessionId);
  if (watch.timer !== null) clearTimeout(watch.timer);
  watch.timer = null;
  return watch;
}

export type StopResult = { stopped: true; id: number; dropped: number } | { stopped: false };

/** Stop one watch. `dropped` is what it had seen but not yet had a chance to say. */
export function stopWatch(sessionId: string, slug: string, cid: string): StopResult {
  const watch = dropWatch(sessionId, keyOf(slug, cid));
  if (watch === null) return { stopped: false };
  watch.stop();
  return { stopped: true, id: watch.id, dropped: watch.pending };
}

/** Every watch this session holds, for a report. */
export const watchesFor = (sessionId: string): { slug: string; cid: string; id: number; scope: WatchScope }[] =>
  [...(bySession.get(sessionId)?.values() ?? [])].map(({ slug, cid, id, scope }) => ({ slug, cid, id, scope }));

/** The session has ended. Detach everything it was holding.
 *
 *  No notice is delivered: there is nothing left to deliver it to, which is the whole difference
 *  between this and a watch that dies while its session lives. */
export function stopWatchesFor(sessionId: string): void {
  const watches = bySession.get(sessionId);
  if (!watches) return;
  for (const watch of watches.values()) {
    if (watch.timer !== null) clearTimeout(watch.timer);
    try {
      watch.stop();
    } catch {
      // Already detached.
    }
  }
  bySession.delete(sessionId);
}
