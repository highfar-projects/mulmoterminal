// The three things a reader may ask of a record they did not write: move it, hand it over, take it
// away. It is the closed set (`IntentKind`), and it is closed for the reason principle 11 gives —
// a general patch would still be judged by the rules, and nothing would be able to say afterwards
// what had happened.
//
// THE JUDGEMENT HERE IS DIAGNOSIS, NOT PERMISSION, and that is the difference from
// `previewIntent.ts`, which looks almost the same. There the write goes out as the app's OWNER, so
// the rules would allow moves the reader on screen may not make, and judging first is the only
// thing keeping the preview from being LOOSER than production. Here the write goes out as the
// reader themselves and the deployed rules answer for exactly the right person — so judging first
// buys one thing only: a refusal with a NAME. "Missing or insufficient permissions" is the whole of
// what the rules say, and an agent handed that cannot tell a move the table does not carry from a
// row belonging to somebody else.
//
// WHICH TIER JUDGES, when this host has no page to be standing on. Production judges an ask against
// the projection of the page it came from; there is no page here. So each tier this reader can read
// is offered the ask in turn, widest first, and the first that carries it wins. That is not a
// permission decision — every projection tried is one publish's own answer for a tier this reader
// is admitted to, and the rules judge the write afterwards either way. What it avoids is the
// arbitrary alternative: picking one tier and calling it the reader's, which would refuse the front
// desk their own transitions on an app whose participant page happened to be found first.
import { readIntentMessage, VIEW_MESSAGE, type IntentKind, type WriteTier } from "@receptron/sharedapp/view";
import { commitIntent } from "../itemWrites.js";
import { quotedTerm } from "../quoted.js";
import { readRecord, TIERS, type JoinedApp } from "./app.js";

export interface AskedIntent {
  kind: IntentKind;
  cid: string;
  itemId: string;
  to?: string | undefined;
}

export type IntentOutcome =
  | {
      ok: true;
      tier: WriteTier;
      mailed: boolean;
      /** Whether the withdrawal reopened a MIRROR — the projected row a booking claimed. Reported
       *  rather than assumed from the action: a survey withdrawal frees nothing, and telling its
       *  author "the slot is open again" invents a place that never existed. */
      reopened: boolean;
    }
  /** `refusal: false` means the write did not COMPLETE, which is not the same as not happening: a
   *  `deadline-exceeded` can come back after Firestore committed and the client lost the answer.
   *  The caller has to say so — "refused" states the opposite of what may have occurred, and the
   *  batch it may have committed carries the notice as well as the record. */
  | { ok: false; error: string; refusal: boolean; refusals?: { tier: WriteTier; reason: string }[] };

/** The row cannot be read, so nothing can be judged about it.
 *
 *  Kept apart from "there is no such row" because they send the caller to opposite places, and
 *  because guessing here would be the worst of both: a transition judged with no record is judged
 *  against a status of `undefined`, which no table carries, so the refusal would name the wrong
 *  thing. */
const UNREADABLE =
  "that record is not readable by you, so nothing here can say what state it is in. Either it is in a collection this app does not open to you, " +
  "or the app has not been published. Nothing was written.";

/** The read BROKE, which is not the same sentence at all: nothing about this reader's permissions
 *  was established, and the ask is worth making again. Told the refusal above instead, the caller
 *  stops asking about a record they may well be entitled to move. */
const unreadableNow = (why: string): string =>
  `that record could not be read: ${why}. That is a failure, not a permission boundary — nothing was written, and the ask is worth making again.`;

/** Why an intent cannot even be judged, or null when the row is in hand. Three answers, kept apart
 *  for the reason every read in this feature keeps them apart: they send the caller to opposite
 *  places, and two of them are final while the third is not. */
function whyNotJudgeable(found: Awaited<ReturnType<typeof readRecord>>, asked: AskedIntent): string | null {
  if (!found.read) return found.refusal ? UNREADABLE : unreadableNow(found.why);
  // QUOTED, though the id came from the CALLER: it came from the caller having read it out of
  // `records`, which is the app's own data. Firestore takes newlines in a document id, so an id
  // built from a submitted value can carry one here.
  if (found.row === null) return `no record ${quotedTerm(asked.itemId)} in ${quotedTerm(asked.cid)}. Nothing was written.`;
  return null;
}

export async function performIntent(app: JoinedApp, asked: AskedIntent): Promise<IntentOutcome> {
  const found = await readRecord(app, asked.cid, asked.itemId);
  const why = whyNotJudgeable(found, asked);
  if (why !== null) return { ok: false, error: why, refusal: found.read || found.refusal };
  const row = found.read && found.row !== null ? found.row : {};

  const holding = (cid: string, itemId: string): Record<string, unknown> | null => (cid === asked.cid && itemId === asked.itemId ? row : null);

  const message = {
    type: VIEW_MESSAGE.intent,
    // The id the PAGE would be waiting on never exists here — nobody is waiting on a channel — so
    // one is stated rather than threaded through. The package requires the field; the answer is
    // returned directly.
    requestId: "participate",
    kind: asked.kind,
    cid: asked.cid,
    itemId: asked.itemId,
    ...(asked.to === undefined ? {} : { to: asked.to }),
  };

  const refusals: { tier: WriteTier; reason: string }[] = [];
  for (const tier of TIERS) {
    const write = app.writes[tier];
    // A tier this app published no projection for is SKIPPED rather than refused: it says nothing
    // about what the reader may do, and reporting it as a refusal would name a missing document as
    // if it were a denial.
    if (write === undefined) continue;
    const read = readIntentMessage(message, write, holding, { address: app.handle.email, tier });
    if (!read.ok) {
      refusals.push({ tier, reason: read.reason });
      continue;
    }
    const failed = await commitIntent(app.aid, read.intent);
    if (failed !== null) {
      // ONLY A REFUSAL MOVES ON. A write that merely failed answers nothing about this reader, and
      // retrying it on the next tier can land the same move through a projection that carries no
      // `mail` — so the record moves and the notice the first tier declared is never queued. That
      // is the one thing the single-shape batch in `itemWrites.ts` exists to prevent.
      if (!failed.refusal) return { ok: false, error: failed.error, refusal: false, refusals };
      // A RULES REFUSAL DOES NOT END THE LOOP, and that is a decision rather than a fall-through.
      // The tiers are different DECLARATIONS about the same reader, and the rules answer about the
      // record: a stale `writers` list can carry a move the deployed rules refuse this person as
      // staff and allow them as the row's own submitter. Stopping here would deny an action they
      // are entitled to, on the strength of a projection that was merely tried first.
      //
      // Retrying is safe and does not lose a declared notice. A batch is atomic, so the refused
      // attempt wrote nothing at all; and `mail` is projected to the MEMBER tier only — the rules
      // let a writer queue it and nobody else — so a roster-tier attempt carrying no notice is that
      // tier's own correct shape, not a dropped one.
      refusals.push({ tier, reason: failed.error });
      continue;
    }
    // Claimed only on success, and only where the declaration named a notice for this move: a batch
    // that was refused sent nothing.
    return { ok: true, tier, mailed: read.intent.mail !== undefined, reopened: read.intent.mirror !== undefined };
  }
  if (refusals.length === 0)
    return {
      ok: false,
      refusal: true,
      error:
        "this app published no projection either tier could judge that against — it has no member or participant pages, and no public submit block for this collection. " +
        "Nothing was written.",
    };
  return { ok: false, refusal: true, error: refusals.map((entry) => `${entry.tier}: ${entry.reason}`).join("; "), refusals };
}
