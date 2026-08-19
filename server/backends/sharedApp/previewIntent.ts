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
import { doc, collection, writeBatch } from "firebase/firestore";
import { APPS_COLLECTION, appSchemasPath } from "@receptron/sharedapp";
import { MIRROR_OPEN, readIntentMessage, VIEW_MESSAGE, type JudgedIntent, type WriteTier } from "@receptron/sharedapp/view";
import { previewPageKey, type PreviewIntent, type PreviewIntentResult } from "../../../common/sharedAppPreview.js";
import { currentFirestore } from "../remoteHost/session.js";
import { previewSharedApp } from "./preview.js";
import { sharedAppContext } from "./context.js";

/** Where a shared collection's records live. Spelled as `previewWrite.ts` spells it. */
const itemsPath = (aid: string, cid: string): string => `${appSchemasPath(aid)}/${cid}/items`;

/** Where a queued notice lives, and the id the RULES rebuild — `{cid}_{itemId}_{template}`.
 *
 *  Fixed rather than chosen, and that is what makes pressing the button twice queue one notice
 *  rather than two. Matched to mulmoserver's `mailDocId`; a divergence here does not fail, it
 *  queues a document the mail rule refuses. */
const mailPath = (aid: string): string => `${APPS_COLLECTION}/${aid}/mail`;
const mailDocId = (cid: string, itemId: string, template: string): string => `${cid}_${itemId}_${template}`;

/** The audiences that have intents at all.
 *
 *  A public page has no reader, no roles and no tier — `readIntentMessage` cannot judge for one,
 *  and there is nothing sensible to judge it AS. Refused by name rather than squeezed into one of
 *  the package's refusals: the package's names are about a declaration, and this one is about the
 *  page having been the wrong kind of page, which no declaration can fix. Unreachable from the pane
 *  (the public parent never routes an intent here) and stated anyway, because the alternative to an
 *  unreachable branch is an unnoticed one. */
export const NOT_A_MEMBER_PAGE = "not-a-member-page";

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

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isTier = (audience: string): audience is WriteTier => audience === "member" || audience === "roster";

/** The batch, and every intent goes through one.
 *
 *  A transition with no notice is a single `update` and could have been sent alone; it is not,
 *  because the branch that decides would then be the only thing standing between a declared notice
 *  and a record that moved without it. One shape, judged once.
 *
 *  THE JUDGEMENT IS OF A SNAPSHOT, AND THIS DOES NOT RE-READ IT. Between the projection above and
 *  this commit, another writer can move the record — so a transition judged legal from the status
 *  the page held can land on a record that has since left it. The window is left open, on purpose,
 *  three times over:
 *
 *  - THE LIVE PAGE HAS IT TOO. mulmoserver's `performIntent` issues the same unconditional
 *    `batch.update` from the same held snapshot, and the package says why: `judgeTransition`
 *    "decides which button should have been drawn, and the rules decide the race". Closing it here
 *    alone would make this host's write a different program from the one it previews.
 *  - `previewWrite.ts` MADE THE SAME CALL for the mirror it checks before claiming — "a check, not
 *    a guarantee, and the difference is a real race with anybody submitting at the same moment".
 *  - AND THE PREVIEW SAYS SO. "Nobody else exists here, so nothing was concurrent" is in the pane's
 *    copied log, in the skill and in this feature's plan — a stated limit rather than a claim this
 *    quietly breaks.
 *
 *  What is NOT excused by any of that: in production the rules close the race, because they compare
 *  the stored status themselves, and here they do not — the write goes out as the OWNER. So the
 *  residue is real and it is named (CodeRabbit on #1802, declined with this note). A transaction is
 *  what would close it, and it belongs to a change that closes it on BOTH hosts. */
async function commit(aid: string, intent: JudgedIntent): Promise<string | null> {
  try {
    const db = currentFirestore();
    const batch = writeBatch(db);
    const item = doc(collection(db, itemsPath(aid, intent.cid)), intent.itemId);
    if (intent.kind === "withdraw") {
      batch.delete(item);
      // The pair the rules require of a withdrawal: `deleteWith` reads `getAfter(mirror).state`, so
      // the row going and the slot reopening are one write or neither.
      if (intent.mirror !== undefined) {
        batch.update(doc(collection(db, itemsPath(aid, intent.mirror)), intent.itemId), { state: MIRROR_OPEN });
      }
      await batch.commit();
      return null;
    }
    if (intent.field === undefined || intent.to === undefined) {
      // Unreachable: only a withdrawal is judged without a field, and it left above. Stated rather
      // than asserted away, because the alternative is writing `{ undefined: undefined }` into
      // somebody's record.
      return `intent ${intent.kind} has no field to move`;
    }
    batch.update(item, { [intent.field]: intent.to });
    if (intent.mail !== undefined) {
      const { to, template, data } = intent.mail;
      const queued: Record<string, unknown> = { cid: intent.cid, itemId: intent.itemId, to, template };
      // Attached rather than spread: `mailShapeOk` accepts these keys and no others, so a key
      // holding `undefined` is a document the rule refuses.
      if (data !== undefined) queued.data = data;
      batch.set(doc(collection(db, mailPath(aid)), mailDocId(intent.cid, intent.itemId, template)), queued);
    }
    await batch.commit();
    return null;
  } catch (err) {
    return messageOf(err);
  }
}

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

  if (!isTier(asked.page.audience)) return { ok: false, error: NOT_A_MEMBER_PAGE };
  const tier = asked.page.audience;

  const preview = await previewSharedApp(root);
  if (!preview.ok) return { ok: false, error: preview.problems.join(" ") };

  // The page has to still be there. A document from the previous render can outlive the view that
  // produced it — the author edits `app.json` while the frame is up — and judging its ask against
  // whatever page happens to be first would perform a move on a projection nobody is looking at.
  const page = preview.pages.find((candidate) => candidate.id === asked.page.id && candidate.audience === tier);
  if (page === undefined) return { ok: false, error: NO_SUCH_PAGE };

  const write = preview.writes[tier] ?? [];
  // THE RECORDS THIS PAGE WAS HANDED, and not the collection at large. The judgement asks what
  // status a row is in, and asking it of a row the page may not even read would decide a member's
  // move from data their projection excludes.
  const held = preview.datasets[previewPageKey(tier, page.id)] ?? {};
  const record = (cid: string, itemId: string): Record<string, unknown> | null => (held[cid] ?? []).find((row) => row.id === itemId) ?? null;

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
    record,
    { address: handle.email, tier },
  );
  if (!read.ok) return { ok: false, error: read.reason };

  // AFTER the package's judgement, not before, so its own refusals keep their names: a cid this
  // view never declared is `unknown-collection`, which says which declaration to change, and it
  // would otherwise be reported as a missing row.
  if (record(read.intent.cid, read.intent.itemId) === null) return { ok: false, error: NOT_IN_VIEW };

  const failed = await commit(preview.aid, read.intent);
  if (failed !== null) return { ok: false, error: failed };
  // Claimed only on success, and only where the declaration named a notice for this move: a batch
  // that was refused sent nothing, and saying otherwise on the same line as the failure would be
  // the one part of the report that lies.
  return { ok: true, mailed: read.intent.mail !== undefined };
}
