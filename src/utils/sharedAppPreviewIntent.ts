// The pane's side of a member's write: narrow the ask, send it, and SAY WHAT HAPPENED.
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

/** What the ask reaches this module as, plus the id the page is waiting on. */
type AskedHere = PreviewIntent & { requestId: string };

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
  if (kind !== "transition" && kind !== "assign" && kind !== "withdraw") return null;
  if (typeof cid !== "string" || typeof itemId !== "string") return null;
  const asked = { requestId, page: { id: current.id, audience: current.audience }, cid, itemId };
  // A withdrawal names no destination, and one carrying a `to` is not a withdrawal with decoration
  // — it is an ask this parent cannot describe, so it is not read as an intent at all.
  if (kind === "withdraw") return to === undefined ? { ...asked, kind } : null;
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
    // Only these two parents route an intent, and the type says so rather than a comment asking for
    // it — the log line names the tier, and a public page has none.
    if (current.audience === "public") return null;
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
      audience: current.audience,
      cid: body.cid,
      itemId: body.itemId,
      ...(body.kind === "transition" && body.to !== undefined ? { to: body.to } : {}),
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
      if (!(await ports.refresh()) && !(await ports.refresh())) {
        ports.remember({
          kind: "host",
          note: `the ${body.kind} was written, but the records could not be re-read afterwards — twice. What is on screen is older than the app, and a control drawn from it may already have been used. Reopen the preview.`,
        });
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
