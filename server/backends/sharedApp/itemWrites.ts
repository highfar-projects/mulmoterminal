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
import { collection, doc, writeBatch } from "firebase/firestore";
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

/** Write one submission. Null on success, else the reason.
 *
 *  CREATE, NEVER OVERWRITE. A submission is create-only, and for `idFrom: "field"` the id IS the
 *  thing being claimed — so an id that already exists means somebody has it. `set` would be an
 *  UPDATE, which the rules permit an owner to make: previewing your own app would silently replace
 *  a real visitor's booking with a test one. */
export async function commitPlannedWrite(handle: SharedAppHandle, aid: string, plan: PlannedWrite): Promise<string | null> {
  try {
    if (plan.mirror === undefined) {
      const made = await handle.docs.create(itemsPath(aid, plan.cid), plan.id, plan.record);
      return made ? null : "already-taken";
    }
    // The paired path cannot ask for create-only: the web SDK's `WriteBatch` has `set`, `update`
    // and `delete`, and no create. So the id is CHECKED first — a check, not a guarantee, and the
    // difference is a real race with anybody submitting at the same moment. What closes it is the
    // batch's own `update` on the mirror: a slot somebody else has just taken no longer satisfies
    // what the rules require of it, and the commit is refused rather than overwriting.
    const db = currentFirestore();
    const taken = await handle.docs.get(itemsPath(aid, plan.cid), plan.id);
    if (taken !== null) return "already-taken";
    const batch = writeBatch(db);
    batch.set(doc(collection(db, itemsPath(aid, plan.cid)), plan.id), plan.record);
    batch.update(doc(collection(db, itemsPath(aid, plan.mirror.cid)), plan.mirror.id), { state: plan.mirror.state });
    await batch.commit();
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
