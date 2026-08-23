// A member's intent, made FROM the preview and performed against the real database.
//
// The pane used to refuse every one of these in one word — `read-only`, from the package's
// `refuseEverything` — because there was no route for a write. So a front desk previewed here drew
// its buttons, and every one of them failed: the author could see that a control was WIRED and
// never that it WORKED, and the difference is the whole of what a progress desk does. This is that
// route.
//
// It is `previewWrite.ts`'s sibling and shares its two decisions. The write goes to FIRESTORE,
// because an app's records live there and nowhere else — a scratch destination would answer "did it
// land" with a yes it did not earn. And the seam is `writeBatch` on `currentFirestore()` rather
// than `handle.docs`, because every operation here is a PAIR the rules read with `getAfter()`:
// a transition and the notice it queues, a withdrawal and the mirror it reopens. Written singly,
// each is refused — safely, and with nothing to tell the author about it.
//
// WHAT IS OURS AND WHAT IS NOT. The judgement is `@receptron/sharedapp/view`'s `readIntentMessage`
// — the same function mulmoserver runs in front of `/m/` and `/p/` — and the batch below is shaped
// after `performIntent` in `../mulmoserver/src/firestore/appWrite.ts`, deliberately: the mail
// document's id is fixed by the rules, and a host that spelled it differently would queue a notice
// nothing can send. What is ours is only the seam and the refusal names this host adds.
//
// AND IT IS NOT LOOSER THAN PRODUCTION. That is the property this file has to hold and the one it
// is easiest to lose, because the author is the app's OWNER: the deployed rules would let them move
// almost any record, so a host that wrote first and let the rules judge would perform moves the
// projection forbids the reader who is actually on screen. The projection is therefore judged HERE,
// against the page the ask came from, before anything is sent.
import { readIntentMessage, VIEW_MESSAGE, type WriteTier } from "@receptron/sharedapp/view";
import { isRecord } from "../../../common/isRecord.js";
import { previewPageKey, type PreviewAudience, type PreviewIntent, type PreviewIntentResult } from "../../../common/sharedAppPreview.js";
import { commitIntent, itemsPath } from "./itemWrites.js";
import { ownSelectors, ownsRow, previewSharedApp } from "./preview.js";
import { sharedAppContext } from "./context.js";

/** WHAT REPLACED `NOT_A_MEMBER_PAGE`.
 *
 *  There used to be a refusal here for "the page was the wrong kind of page" — a public page asking
 *  to move a record. It is gone because it was wrong: the rules let the person who submitted a row
 *  move it and take it away wherever they are standing, and the constant existed only because the
 *  public parent had no `perform` port to reach this with. Both halves are now wired, and an ask
 *  from a public page is judged exactly as a participant's is.
 *
 *  Kept as a note rather than as a dead export: nothing compares the string, and a refusal name
 *  that no longer refuses anything is the kind of thing that gets re-added by pattern-matching. */

/** The preview has no page under that id — the author renamed or removed a view and a document from
 *  the previous render is still on screen asking about it. */
export const NO_SUCH_PAGE = "no-such-page";

/** The named row is not among the records this page was handed.
 *
 *  THE PACKAGE DELIBERATELY DOES NOT REFUSE THIS, and that is why this host must. `judgeTransition`
 *  answers `ok` for a record it is holding none of, and `judgeWithdraw` never asks whose row it is
 *  at all — both leave ownership to the rules, which compare an address the projection does not
 *  carry. On a live page that is exactly right: the write goes out as the PARTICIPANT, and `ownRow`
 *  refuses somebody else's row.
 *
 *  Here it goes out as the app's OWNER, who may update or delete anything in their own app. So the
 *  check the rules would have made is not going to happen, and without this a participant's page
 *  could name a row it was never shown — one belonging to another participant, kept out of its
 *  dataset by `scope: "own"` — and move it, or withdraw it and reopen the mirror it was holding.
 *  That is the preview being LOOSER than production, which is the one thing it must never be.
 *
 *  What replaces the rules' question is the dataset itself: the page was handed precisely the rows
 *  its projection allows it to read, so requiring the row to be in it asks the same thing the rules
 *  would have asked, in the only terms this host can ask it. */
export const NOT_IN_VIEW = "not-in-view";

/** WHICH TIER JUDGES THIS PAGE'S ASK.
 *
 *  The public page is judged as a PARTICIPANT, and that is a statement about the rules rather than
 *  a convenience: `ownRow` in `firestore.rules` asks for `authed()` and nothing else — no role, no
 *  membership, an anonymous uid will do — and the moves it allows come from `public.submit[cid]`
 *  (`selfTransitions`, `selfDelete`), which is the public page's own declaration. So a visitor who
 *  booked a slot and a participant who booked the same slot may do exactly the same things to it.
 *
 *  It used to be refused here by name, on the reasoning that "a public page has no reader, no roles
 *  and no tier". Two of those are true and the conclusion was not: what it has instead is the
 *  roster tier's answer, which is "there are no roles; the rules answer from the record". */
const tierOf = (audience: PreviewAudience): WriteTier => {
  if (audience === "member") {
    return "member";
  }
  return "roster";
};

/** Perform one intent the pane's member parent received.
 *
 *  `asked` has been narrowed in the browser to the shape below and NOTHING else has been decided
 *  there. It is judged here for the reason every check on the far side of a sandboxed frame is a
 *  courtesy rather than a gate — and because the browser holds neither the projection nor the
 *  author's verified address, which are the two things every capability question resolves against. */
export async function performPreviewIntent(root: string, asked: PreviewIntent): Promise<PreviewIntentResult> {
  const context = await sharedAppContext(root);
  if (!context.ok) return { ok: false, error: context.problems.join(" ") };
  const { handle } = context;

  const audience = asked.page.audience;
  const tier = tierOf(audience);

  const preview = await previewSharedApp(root);
  if (!preview.ok) return { ok: false, error: preview.problems.join(" ") };

  // The page has to still be there. A document from the previous render can outlive the view that
  // produced it — the author edits `app.json` while the frame is up — and judging its ask against
  // whatever page happens to be first would perform a move on a projection nobody is looking at.
  const page = preview.pages.find((candidate) => candidate.id === asked.page.id && candidate.audience === audience);
  if (page === undefined) return { ok: false, error: NO_SUCH_PAGE };

  const write = preview.writes[audience] ?? [];
  // THE RECORDS THIS PAGE WAS HANDED, and not the collection at large. The judgement asks what
  // status a row is in, and asking it of a row the page may not even read would decide a member's
  // move from data their projection excludes.
  const held = preview.datasets[previewPageKey(audience, page.id)] ?? {};
  // THE PAGE'S DATASETS **AND** THE READER'S OWN ROWS, because those are the two things a live page
  // is handed and they are not the same list. A collection people submit to is exactly the one
  // `public.read` cannot open — one visitor would be reading every other visitor's answer — so the
  // row a public page moves is never in its datasets. It arrives as `viewer.mine`, which is the
  // whole reason that message exists, and an intent judged against the datasets alone answered
  // `not-in-view` about a row the page was legitimately showing.
  //
  // It does not widen anything: `own` is filtered to the author's own rows by the same three
  // selectors the rules identify one by (`readCollection`), so a row somebody else submitted is in
  // neither list.
  const record = (cid: string, itemId: string): Record<string, unknown> | null =>
    (held[cid] ?? []).find((row) => row.id === itemId) ?? (preview.own[cid] ?? []).find((row) => row.id === itemId) ?? null;

  /** THE ROW THE PAGE FOUND WHEN NO LIST COULD.
   *
   *  `viewer.mine` is built from a LIST, and `view.mine(cid, key)` is a `get` — so the two do not
   *  fail together. A list refused on an app published a moment ago, an offline blink, any
   *  transient: `own` loses the collection for that render, the page's keyed lookup still answers,
   *  and the control it draws would then fail `not-in-view`. Rendered and refused is precisely the
   *  shape this whole change removes.
   *
   *  IT CANNOT BE LOOSER THAN THE LIST, because it asks the SAME question: `ownsRow`, the predicate
   *  `readCollection` filters with, which is `ownRow` in the rules said in the terms this host has.
   *  A staff page asking after somebody else's row still gets `not-in-view` — nothing here widens
   *  what a page may name, it only stops the host refusing a row the reader owns.
   *
   *  Not reached for a row already held: the ordinary intent costs no read. */
  const ownRecord = async (cid: string, itemId: string): Promise<Record<string, unknown> | null> => {
    const want = ownSelectors(preview.config)[cid];
    if (want === undefined) return null;
    const found = await handle.docs.get(itemsPath(preview.aid, cid), itemId).catch(() => null);
    if (!isRecord(found)) return null;
    const row = { ...found, id: itemId };
    return ownsRow(want, row, handle) ? row : null;
  };

  // RESOLVED BEFORE THE JUDGEMENT, so the package sees the row's real status rather than nothing —
  // and so that what is judged and what is checked below cannot be two different answers.
  const asking = record(asked.cid, asked.itemId) ?? (await ownRecord(asked.cid, asked.itemId));
  const holding = (cid: string, itemId: string): Record<string, unknown> | null => {
    if (cid === asked.cid && itemId === asked.itemId) return asking;
    return record(cid, itemId);
  };

  // Rebuilt into the message shape the package reads, rather than the package being given a second
  // entry point for a pre-parsed ask: `readIntentMessage` is what mulmoserver judges with, and a
  // shortcut past its own narrowing is a second reading of what an intent IS. The request id is
  // this side's — the one the page is waiting on never leaves the browser, which answers it.
  const read = readIntentMessage(
    {
      type: VIEW_MESSAGE.intent,
      requestId: "preview",
      kind: asked.kind,
      cid: asked.cid,
      itemId: asked.itemId,
      ...(asked.to === undefined ? {} : { to: asked.to }),
    },
    write,
    holding,
    { address: handle.email, tier },
  );
  if (!read.ok) return { ok: false, error: read.reason };

  // AFTER the package's judgement, not before, so its own refusals keep their names: a cid this
  // view never declared is `unknown-collection`, which says which declaration to change, and it
  // would otherwise be reported as a missing row.
  if (holding(read.intent.cid, read.intent.itemId) === null) return { ok: false, error: NOT_IN_VIEW };

  const failed = await commitIntent(preview.aid, read.intent);
  if (failed !== null) return { ok: false, error: failed };
  // Claimed only on success, and only where the declaration named a notice for this move: a batch
  // that was refused sent nothing, and saying otherwise on the same line as the failure would be
  // the one part of the report that lies.
  return { ok: true, mailed: read.intent.mail !== undefined };
}
