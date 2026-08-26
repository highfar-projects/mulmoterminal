// The pane's side of a WRITE THE PAGE ASKS FOR: narrow the ask, send it, and SAY WHAT HAPPENED.
//
// A member's move and a visitor's own — a booking they cancel on the public page — both arrive
// here, because both are the same message from the same parent and the server judges them the same
// way.
//
// The last of those is the one that is easy to leave out and is not optional. An intent is answered
// on the port, into a promise the page usually does not await — so a refusal has no pixels of its
// own, and what the author sees is a button that did nothing. The line this module writes into the
// preview log is the only account of it there is.
//
// WHAT IS DECIDED HERE IS NOTHING. Whether the move is in the declared table, whether this reader
// may make it, whether the record is in a status it can leave — all of that is judged on the server
// (`server/backends/sharedApp/previewIntent.ts`), which is the only side holding the projection and
// the author's verified address. A second judge here could disagree with the one that performs the
// write, which is the divergence `PreviewPage.viewer` was introduced to remove. This narrows a
// message to a shape and reports what came back.
//
// Its own module rather than more of `SharedAppPreview.vue` because it needs no component: the
// four things it uses are passed in, so what a refusal does to the log can be pinned without
// mounting a frame.
import { VIEW_MESSAGE, type IntentAnswer, type PerformIntent } from "@receptron/sharedapp/view";
import { isRecord } from "../../common/isRecord";
import { fetchWithTimeout, SLOW_COMMAND_TIMEOUT_MS } from "./fetchWithTimeout";
import type { PreviewLogEvent } from "./sharedAppPreviewLog";
import type { PreviewIntent, PreviewPage } from "../../common/sharedAppPreview";

/** How many times the records are re-read before the screen is called stale.
 *
 *  TWO, because the failure being recovered from is a blip — a request that timed out, a server
 *  restarted between the write and the read — and one more attempt turns most of them into a screen
 *  that is simply correct. A number rather than a second call written out, so what it is is visible
 *  and a linter does not have to be told that two identical reads are the point. */
const REFRESH_ATTEMPTS = 2;

/** What the ask reaches this module as, plus the id the page is waiting on. */
type AskedHere = PreviewIntent & { requestId: string };

/** A correction's values, or null when the message does not describe a set of them.
 *
 *  STRINGS ONLY, and the whole message is refused rather than the offending entry dropped — the
 *  same line `readIntentMessage` draws, because a page sending a number has been half understood by
 *  a filter and the write that followed would be a different write from the one it asked for. */
const valuesOf = (value: unknown): Record<string, string> | null => {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === "string")) return null;
  return Object.fromEntries(entries);
};

/** Is this an intent, and which one? SHAPE ONLY — the same line the package's own reader draws,
 *  and deliberately no further.
 *
 *  The page it was asked from travels with it. Which tier's projection judges the move, and which
 *  records it may name, are both decided by that page — so a participant's page cannot reach the
 *  front desk's transitions by naming the collection they live in. */
export function askedIntent(data: unknown, current: PreviewPage): AskedHere | null {
  if (!isRecord(data) || data.type !== VIEW_MESSAGE.intent) return null;
  const { requestId, kind, cid, itemId, to } = data;
  // An empty id is nobody waiting, and answering it would be answering something nobody asked —
  // the package draws the same line in `answerId`.
  if (typeof requestId !== "string" || requestId === "") return null;
  if (kind !== "transition" && kind !== "assign" && kind !== "withdraw" && kind !== "correct") return null;
  if (typeof cid !== "string" || typeof itemId !== "string") return null;
  const asked = { requestId, page: { id: current.id, audience: current.audience }, cid, itemId };
  // A withdrawal names no destination, and one carrying a `to` is not a withdrawal with decoration
  // — it is an ask this parent cannot describe, so it is not read as an intent at all.
  if (kind === "withdraw") return to === undefined ? { ...asked, kind } : null;
  // A correction names none either, and carries values instead. An EMPTY map still travels: the
  // server refuses it by name (`nothing-to-correct`) rather than this dropping it, because a page
  // bug that leaves a promise unanswered looks exactly like a button that does nothing — which is
  // the failure this whole module is written against.
  if (kind === "correct") {
    const values = valuesOf(data.values);
    return to === undefined && values !== null ? { ...asked, kind, values } : null;
  }
  if (typeof to !== "string") return null;
  return { ...asked, kind, to };
}

export interface IntentSenderPorts {
  /** The page on screen, asked each time rather than captured: the pane swaps it under the bridge. */
  page: () => PreviewPage | null;
  /** The route, already scoped to the cell's directory. */
  url: () => string;
  remember: (event: PreviewLogEvent) => void;
  /** Re-read the records, answering whether the screen is now CURRENT. Awaited before the page is
   *  answered — see below — and its answer is not decoration: the read can fail, and a move
   *  acknowledged over records that never moved is a page drawing a control it has already used. */
  refresh: () => Promise<boolean>;
  /** LAST RESORT: take the stale page off the screen.
   *
   *  Called only when the records could not be re-read at all, which leaves a document drawing rows
   *  that no longer exist and offering a control it has already used. A log line tells the AUTHOR
   *  about that; it cannot tell the PAGE, and the page is what somebody is looking at.
   *
   *  So the pane rebuilds itself instead. Whatever it then shows is true: the new records if the
   *  read succeeds this time, and "could not reach the server" if it does not — which is the honest
   *  screen for the condition that got here.
   *
   *  It MUST NOT run before the page has been answered. Rebuilding restarts the bridge, and an
   *  answer posted onto a closed channel leaves the view waiting for ever on a request that
   *  actually succeeded — the exact failure the submit path's comment warns about. The host defers
   *  it; this only says when. */
  recover: () => void;
}

/** One intent, sent to the route that performs it as the author.
 *
 *  THE ANSWER IS COMPOSED HERE because the request id never leaves this machine: the server is told
 *  what to do, not what to reply on, so a route that answered directly would be inventing an id for
 *  a promise it cannot see.
 *
 *  `refresh()` is AWAITED, unlike the submission path in the pane, and the difference is which page
 *  is looking. A member's page redraws from its own answer — a desk clears "switching…" and renders
 *  its list — so answering before the new records have been sent leaves it drawing the state the
 *  move just replaced, with nothing to correct it until a state message races in behind. It is safe
 *  to await: `refresh` swaps only the payload, never the document, and swallows its own failures. */
export const createIntentSender = (ports: IntentSenderPorts): PerformIntent => {
  return async (data: unknown): Promise<IntentAnswer | null> => {
    const current = ports.page();
    if (current === null) return null;
    // EVERY page routes an intent, the public one included, and the refusal that used to be here is
    // gone rather than moved. It read "a public page has no reader and no roles for a move to be
    // judged against", which is a statement about MEMBERSHIP and never was what the rules ask: a
    // `selfTransitions` or `selfDelete` move is granted to whoever submitted the row, on an
    // anonymous uid, with no role at all. The server half was rewritten to judge a public ask as a
    // participant's (`tierOf` in `previewIntent.ts`) and this line stayed — so the pane dropped the
    // ask before the route could take it, and an author pressing their own page's "cancel" button
    // watched nothing happen while the live page performed it.
    const asked = askedIntent(data, current);
    if (asked === null) return null;
    const { requestId, ...body } = asked;
    // THE DESTINATION IS CARRIED FOR A TRANSITION AND NOT FOR AN ASSIGNMENT, and the difference is
    // what the value IS. A transition's `to` is a status out of the declaration — the app's own
    // vocabulary, which the log is full of. An assignment's is a PERSON'S ADDRESS, and this block is
    // built to be pasted somewhere else: the promise at the top of `sharedAppPreviewLog.ts` is field
    // names and never the values in a record, and an address is the clearest thing that promise is
    // about. The renderer says an address was withheld rather than dropping the fact of it, so
    // `unknown-assignee` still reads as "the address you named", which is the actionable half.
    //
    // `itemId` is carried, and that IS a value — see the note at the renderer. A row id is what the
    // rules pin, so a refusal that cannot name the row is one the author cannot place.
    const noted = {
      kind: "intent" as const,
      intent: body.kind,
      cid: body.cid,
      itemId: body.itemId,
      ...(body.kind === "transition" && body.to !== undefined ? { to: body.to } : {}),
      // FIELD NAMES, never the values — which is the promise at the top of `sharedAppPreviewLog.ts`
      // said about the one intent that actually carries record content. An author reading the log
      // needs to know WHICH fields a refusal was about; what was typed into them is in front of
      // them on the screen.
      ...(body.values === undefined ? {} : { fields: Object.keys(body.values) }),
    };
    try {
      const res = await fetchWithTimeout(
        ports.url(),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        SLOW_COMMAND_TIMEOUT_MS,
      );
      const answer: unknown = await res.json();
      if (!isRecord(answer) || answer.ok !== true) {
        // THE ONE THIS PANE ALONE CAN REPORT. A refusal named by the projection tells the author
        // which declaration to change; one from the deployed rules names nothing at all. Neither
        // reaches the screen — the page is handed it on the port and usually does not draw it.
        const error = isRecord(answer) && typeof answer.error === "string" ? answer.error : "intent-failed";
        ports.remember({ ...noted, error });
        return { requestId, ok: false, error };
      }
      // A NOTICE WENT OUT WITH IT. The one effect of this path that cannot be taken back — a real
      // member gets real mail — so it is said out loud rather than left for the author to infer
      // from a declaration they wrote days ago.
      ports.remember({ ...noted, error: null, mailed: answer.mailed === true });
      // THE ANSWER IS STILL `ok`, and that is a decision rather than an oversight. Two reasons, and
      // the second is the one that settles it:
      //
      //   THE WRITE HAPPENED. The record moved, and where the declaration named one, a notice went
      //   with it. Telling the page it failed puts the operator in front of a button they will
      //   press again — a second transition and a second notice about a move that already
      //   succeeded. What is wrong in this branch is the SCREEN, not the write.
      //
      //   AND THE LIVE PAGE ANSWERS THE SAME. mulmoserver's `refresher` (`memberViewRun.ts`) reads
      //   the datasets with `.catch(() => null)` and leaves them untouched, after which `attempt`
      //   returns `{ ok: true }` regardless — so a failed re-read is acknowledged there exactly as
      //   it is here. Answering something else would make this parent a different program from the
      //   one it previews, and `IntentAnswer.error` is shared wire vocabulary the package documents
      //   as permanent and published pages compare: a name only this host sends is a branch no page
      //   can have been written against.
      //
      // What this host adds is the LOG, which production has no reader for and this pane does.
      //
      // So the screen is what is reported. Without this the pane could acknowledge a move over
      // records that never changed — the page clears its pending state and goes on drawing the
      // control it has just used, which looks exactly like a button that does nothing.
      // TRIED TWICE BEFORE IT IS CALLED STALE. The failure this recovers from is a blip — a request
      // that timed out, a server restarted between the write and the read — and one more attempt
      // turns most of them into a screen that is simply correct. It is the half of the answer this
      // host CAN give: the wire answer belongs to production (above), the screen does not.
      //
      // Sequential rather than concurrent, and awaited before answering, for `refresh`'s own reason:
      // the page redraws from this answer, so state that arrives after it redraws against nothing.
      let current = false;
      for (let attempt = 0; attempt < REFRESH_ATTEMPTS && !current; attempt += 1) {
        current = await ports.refresh();
      }
      if (!current) {
        ports.remember({
          kind: "host",
          note: `the ${body.kind} was written, but the records could not be re-read afterwards — twice. What was on screen was older than the app, so the preview was rebuilt: what it shows now is either the new records or the reason it cannot read them.`,
        });
        // The page cannot be corrected through this answer — see the port. It is replaced instead.
        ports.recover();
      }
      return { requestId, ok: true };
    } catch {
      // The request threw, so this does not know whether the record moved. Unlike a submission
      // there is nothing to remember it BY — a transition creates no document the pane could later
      // offer to take back — so saying so in the log is the whole of what can be done about it.
      ports.remember({ ...noted, error: "the request failed after it was sent — the record may or may not have moved" });
      await ports.refresh();
      return { requestId, ok: false, error: "intent-failed" };
    }
  };
};
