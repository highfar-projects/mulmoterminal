// The two writes an app's records take, spelled once.
//
// A submission (create, and the mirror it may claim in the same batch) and an intent (a transition
// and the notice it queues, a withdrawal and the mirror it reopens). Both were written twice — in
// `previewWrite.ts` and `previewIntent.ts`, for the author's preview — and are now written a third
// time, by the participate path, which reaches an app this repository does not hold.
//
// They are here rather than duplicated because the RULES read the shape, not the caller: the mail
// document's id is rebuilt by `firestore.rules` from `{cid}_{itemId}_{template}`, and a pair the
// rules read with `getAfter()` is refused when written singly — safely, and with nothing to tell
// anybody about it. Two spellings of that is two chances to queue a notice nothing can send.
//
// WHAT IS OURS AND WHAT IS NOT. The shapes are `@receptron/sharedapp/view`'s and mulmoserver's
// (`src/firestore/appWrite.ts`'s `performIntent`); what is ours is the seam to the database. The
// batch goes through `writeBatch` on `currentFirestore()` rather than through `handle.docs`,
// because that seam has `set` / `create` / `delete` and no batch — see the note in `previewWrite.ts`
// on why core is not the place to add one.
import { collection, doc, runTransaction, writeBatch } from "firebase/firestore";
import { appSchemasPath, APPS_COLLECTION } from "@receptron/sharedapp";
import { MIRROR_OPEN, type JudgedIntent, type PlannedWrite } from "@receptron/sharedapp/view";
import { currentFirestore } from "../remoteHost/session.js";
import type { SharedAppHandle } from "./context.js";

/** Where a shared collection's records live. */
export const itemsPath = (aid: string, cid: string): string => `${appSchemasPath(aid)}/${cid}/items`;

/** Where a queued notice lives. */
export const mailPath = (aid: string): string => `${APPS_COLLECTION}/${aid}/mail`;

/** The id the RULES rebuild — `{cid}_{itemId}_{template}`.
 *
 *  Fixed rather than chosen, and that is what makes pressing the button twice queue one notice
 *  rather than two. A divergence here does not fail, it queues a document the mail rule refuses. */
export const mailDocId = (cid: string, itemId: string, template: string): string => `${cid}_${itemId}_${template}`;

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The id was already there. Named rather than reported as a rules refusal: under
 *  `idFrom: "field"` the id IS the thing being claimed, so this means somebody has it. */
const TAKEN = "already-taken";

/** Write one submission. Null on success, else the reason.
 *
 *  CREATE, NEVER OVERWRITE. A submission is create-only, and for `idFrom: "field"` the id IS the
 *  thing being claimed. `set` would be an UPDATE, which the deployed rules permit a WRITER to make:
 *  an owner submitting through their own app would silently replace a real visitor's booking.
 *
 *  THE MIRRORED PATH IS A TRANSACTION, and it has to be. `WriteBatch` has `set`, `update` and
 *  `delete` and no create, so this used to read the id first and then write — a check, not a
 *  guarantee. The comment that stood here said the mirror's own `update` closed the race, and that
 *  was WRONG: `mirrorClaimed` in `firestore.rules:450` only requires the AFTER state to be `taken`
 *  and says nothing about what it was before, so a slot another participant had just claimed
 *  satisfied it perfectly — and for a writer the `set` was an allowed update. Two people claiming
 *  the same slot ended with one of them holding a record they never wrote. A transaction re-reads
 *  and re-runs when the document changed under it, which is the only thing that actually closes it.
 *  (Codex on #1843. The batch is still what the rules see: a transaction commits as one write.)
 *
 *  AND IT IS ONLY AVAILABLE TO A READER, which is why there are two shapes below rather than one.
 *  See the branch: the participant who cannot read the destination is the one the rules already
 *  protect, and the writer the transaction protects against is the one who can read. */
export async function commitPlannedWrite(handle: SharedAppHandle, aid: string, plan: PlannedWrite): Promise<string | null> {
  try {
    if (plan.mirror === undefined) {
      const made = await handle.docs.create(itemsPath(aid, plan.cid), plan.id, plan.record);
      return made ? null : TAKEN;
    }
    const db = currentFirestore();
    const mirror = plan.mirror;
    // CAN THIS WRITER READ THE DESTINATION AT ALL? Asked first, because the answer decides which of
    // the two shapes below is even available — and because for most submitters it is NO.
    //
    // A collection people submit to is exactly the one `public.read` cannot open, so a participant
    // reaches a row only through `ownRow` — which reads fields off a document that, here, does not
    // exist yet. The rules deny that get, and Firestore authorizes a TRANSACTION's reads separately:
    // a transaction that opens with this read is refused for the ordinary participant before it
    // writes anything.
    const readable = await handle.docs
      .get(itemsPath(aid, plan.cid), plan.id)
      .then((held) => ({ ok: true as const, held }))
      .catch(() => ({ ok: false as const, held: null }));
    if (readable.ok && readable.held !== null) return TAKEN;

    if (!readable.ok) {
      // WE CANNOT READ, AND THE RULES CLOSE IT FOR US. Every write this branch can make is a create
      // or an update of the caller's OWN row: `set` on somebody else's record is an update, and
      // `updateWith` refuses one that does not satisfy `ownRow`. The race the transaction exists to
      // close is a WRITER's — an owner or editor, for whom `set` is an allowed update — and a writer
      // can read the collection, so a writer never arrives here.
      const batch = writeBatch(db);
      batch.set(doc(collection(db, itemsPath(aid, plan.cid)), plan.id), plan.record);
      batch.update(doc(collection(db, itemsPath(aid, mirror.cid)), mirror.id), { state: mirror.state });
      await batch.commit();
      return null;
    }

    await runTransaction(db, async (tx) => {
      const item = doc(collection(db, itemsPath(aid, plan.cid)), plan.id);
      // READS BEFORE WRITES, which a transaction requires — and this read is the whole point of
      // using one: it is what the commit is re-run against. The read above is NOT that guarantee;
      // it only established that this caller may make it.
      const held = await tx.get(item);
      if (held.exists()) throw new Error(TAKEN);
      tx.set(item, plan.record);
      tx.update(doc(collection(db, itemsPath(aid, mirror.cid)), mirror.id), { state: mirror.state });
    });
    return null;
  } catch (err) {
    return messageOf(err);
  }
}

/** Perform one judged intent. Null on success, else the reason.
 *
 *  EVERY INTENT GOES THROUGH A BATCH. A transition with no notice is a single `update` and could
 *  have been sent alone; it is not, because the branch that decides would then be the only thing
 *  standing between a declared notice and a record that moved without it. One shape, judged once.
 *
 *  THE JUDGEMENT IS OF A SNAPSHOT AND THIS DOES NOT RE-READ IT. Between the judgement and this
 *  commit another writer can move the record. The window is left open deliberately — mulmoserver's
 *  `performIntent` issues the same unconditional `batch.update` from the same held snapshot, and
 *  the package says why: `judgeTransition` "decides which button should have been drawn, and the
 *  rules decide the race". Closing it on one host alone would make that host a different program.
 *  Note the asymmetry the author's preview has and the participate path does not: there the write
 *  goes out as the app's OWNER, so the rules do not close the race either. Here it goes out as the
 *  reader, and `ownRow` / the transition table are evaluated against the STORED record. */
export async function commitIntent(aid: string, intent: JudgedIntent): Promise<string | null> {
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
