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
import { collection, doc, FieldPath, runTransaction, writeBatch } from "firebase/firestore";
import { appSchemasPath, APPS_COLLECTION } from "@receptron/sharedapp";
import { MIRROR_OPEN, type JudgedIntent, type PlannedWrite } from "@receptron/sharedapp/view";
import { currentFirestore } from "../remoteHost/session.js";
import { refused } from "./refused.js";
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
 *  AND NEITHER CHECKED SHAPE IS AVAILABLE TO A SUBMITTER WHO CANNOT READ, which is why there are
 *  four paths below rather than two. The participant who cannot read the destination is the one the
 *  rules already protect; the writer the check protects against is the one who can read. */
export async function commitPlannedWrite(handle: SharedAppHandle, aid: string, plan: PlannedWrite): Promise<WriteFailure | null> {
  try {
    // CAN THIS SUBMITTER READ THE DESTINATION AT ALL? Asked once, before either shape, because the
    // answer decides which of them is even available — and because for most submitters it is NO.
    //
    // A collection people submit to is exactly the one `public.read` cannot open, so a participant
    // reaches a row only through `ownRow` — which reads fields off a document that, here, does not
    // exist yet. The rules deny that get. Both create shapes otherwise open with exactly this read:
    // `handle.docs.create` runs a TRANSACTION that reads the id first (`createFirestoreDocs` in
    // core), and the mirrored path's transaction does the same. Firestore authorizes a
    // transaction's reads separately, so either would be refused for the ordinary participant
    // before writing anything — a private survey could not be answered at all.
    //
    // ASKED SEPARATELY rather than inferred from a create that failed, and that is the point: a
    // refusal from the create seam cannot say whether the READ or the WRITE was turned down, and
    // treating a refused write as "cannot read" would retry it as a plain `set` — which for a
    // WRITER is an allowed update over somebody else's record.
    const readable = await handle.docs
      .get(itemsPath(aid, plan.cid), plan.id)
      .then((held) => ({ ok: true as const, held }))
      .catch((err: unknown) => {
        // ONLY A REFUSAL FALLS THROUGH. Anything else — a blip, an offline moment — is reported as
        // itself and writes nothing: a transient failure read as "cannot read" would give a writer
        // the unchecked branch, and the whole point of the check is that writers do not get it.
        if (refused(err)) return { ok: false as const, held: null };
        throw err;
      });
    if (readable.ok && readable.held !== null) return { error: TAKEN, refusal: false };

    if (!readable.ok) {
      // THE UNCHECKED WRITE, for the caller who may not read. Every write it can make is a create
      // or an update of the caller's OWN row: `set` over somebody else's record is an update, and
      // `updateWith` refuses one that does not satisfy `ownRow`. The race the checked shapes exist
      // to close is a WRITER's — an owner or editor, for whom `set` is an allowed update — and a
      // writer can read the collection, so a writer never arrives here.
      if (plan.mirror === undefined) {
        // THROUGH THE SEAM, which has a plain `set` and reaches Firestore without the SDK handle.
        // Not a detail: `currentFirestore()` throws when no session is open, and an unmirrored
        // submission never needed one — asking for it here would replace the rules' refusal with a
        // message about a session, on the one path where the rules' answer is what the caller is
        // waiting for.
        await handle.docs.set(itemsPath(aid, plan.cid), plan.id, plan.record);
        return null;
      }
      const db = currentFirestore();
      const item = doc(collection(db, itemsPath(aid, plan.cid)), plan.id);
      const batch = writeBatch(db);
      batch.set(item, plan.record);
      batch.update(doc(collection(db, itemsPath(aid, plan.mirror.cid)), plan.mirror.id), { state: plan.mirror.state });
      await batch.commit();
      return null;
    }

    // A READER, so the id can be held against a concurrent claim.
    if (plan.mirror === undefined) {
      const made = await handle.docs.create(itemsPath(aid, plan.cid), plan.id, plan.record);
      return made ? null : { error: TAKEN, refusal: false };
    }
    const db = currentFirestore();
    const mirror = plan.mirror;
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
    // `TAKEN` is thrown out of the transaction body to abort it, and it is not a rules refusal —
    // it is this host's own answer about an id that is already there.
    const error = messageOf(err);
    return { error, refusal: error !== TAKEN && refused(err) };
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
/** A write that did not land, and whether the RULES are what turned it down.
 *
 *  The same pair `readRecord` and `readRecords` carry, for the same reason: a refusal is final and
 *  a failure is worth retrying, and the caller reports them in opposite words. */
export interface WriteFailure {
  error: string;
  refusal: boolean;
}

export interface IntentFailure {
  error: string;
  /** Did the RULES turn this down, as opposed to the write failing?
   *
   *  Carried because the caller offers the ask to another tier, and only a refusal makes that
   *  right: a tier is a different DECLARATION about the same reader, so the rules answering "no" to
   *  one leaves the next worth asking. A network failure answers nothing about either — retried, it
   *  can land the same move through a projection that carries no `mail`, so the record moves and
   *  the notice the first tier declared is never queued. */
  refusal: boolean;
}

export async function commitIntent(aid: string, intent: JudgedIntent): Promise<IntentFailure | null> {
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
      return { error: `intent ${intent.kind} has no field to move`, refusal: false };
    }
    // `new FieldPath(name)` rather than the object form, and for the reason the own-row query uses
    // one: a dotted key is a NESTED PATH to `update`, so an app whose `statusField` is
    // `workflow.state` — a literal top-level field to the records and to the rules — would have a
    // map called `workflow` written beside the field the state actually lives in. The rules read the
    // one the declaration names, so the transition is refused; where they did not, the record would
    // be quietly corrupted.
    batch.update(item, new FieldPath(intent.field), intent.to);
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
    return { error: messageOf(err), refusal: refused(err) };
  }
}
