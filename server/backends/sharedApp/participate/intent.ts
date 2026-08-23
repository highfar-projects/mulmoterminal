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
import { readRecord, TIERS, type JoinedApp } from "./app.js";

export interface AskedIntent {
  kind: IntentKind;
  cid: string;
  itemId: string;
  to?: string | undefined;
}

export type IntentOutcome = { ok: true; tier: WriteTier; mailed: boolean } | { ok: false; error: string; refusals?: { tier: WriteTier; reason: string }[] };

/** The row cannot be read, so nothing can be judged about it.
 *
 *  Kept apart from "there is no such row" because they send the caller to opposite places, and
 *  because guessing here would be the worst of both: a transition judged with no record is judged
 *  against a status of `undefined`, which no table carries, so the refusal would name the wrong
 *  thing. */
const UNREADABLE =
  "that record could not be read, so nothing here can say what state it is in. Either it is in a collection this app does not open to you, " +
  "or the app has not been published. Nothing was written.";

export async function performIntent(app: JoinedApp, asked: AskedIntent): Promise<IntentOutcome> {
  const found = await readRecord(app, asked.cid, asked.itemId);
  if (!found.read) return { ok: false, error: UNREADABLE };
  if (found.row === null) return { ok: false, error: `no record "${asked.itemId}" in "${asked.cid}". Nothing was written.` };
  const row = found.row;

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
    if (failed !== null) return { ok: false, error: failed, refusals };
    // Claimed only on success, and only where the declaration named a notice for this move: a batch
    // that was refused sent nothing.
    return { ok: true, tier, mailed: read.intent.mail !== undefined };
  }
  if (refusals.length === 0)
    return {
      ok: false,
      error:
        "this app published no projection either tier could judge that against — it has no member or participant pages, and no public submit block for this collection. " +
        "Nothing was written.",
    };
  return { ok: false, error: refusals.map((entry) => `${entry.tier}: ${entry.reason}`).join("; "), refusals };
}
