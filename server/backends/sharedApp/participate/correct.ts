// Correcting a record you submitted — the fourth thing `useSharedApp` can ask of one, and the only
// one that is not a MOVE.
//
// The other three (`transition`, `assign`, `withdraw`) are `IntentKind`, which is the vocabulary a
// SANDBOXED PAGE may send its parent. This one is deliberately NOT in that set. The reason is the
// one principle 11 gives for keeping that vocabulary closed: a general patch would still be judged
// by the rules, but a bug in a published page would reach as far as its reader's own row, and
// nothing above it could say afterwards what had been written. A page keeps two verbs, each moving
// one declared field.
//
// What is different HERE is who is asking. This is an agent on the machine of the person whose row
// it is, acting as them through their own credentials — the same footing as that person opening the
// app's page and retyping a paragraph. So the ask exists, and it is bounded by the declaration
// rather than by a fixed vocabulary: `selfUpdate[<current status>]` names the fields, and anything
// outside them is refused here BEFORE the rules refuse it, so the refusal can name the field and
// the status instead of arriving as "Missing or insufficient permissions".
//
// NOTHING HERE GRANTS ANYTHING. `selfWriteOk` in `firestore.rules` answers last and answers for the
// real person; if these two ever disagree, this one is wrong.
import { FieldPath, collection, doc, writeBatch } from "firebase/firestore";

import { currentFirestore } from "../../remoteHost/session.js";
import { messageOf } from "../../../errors.js";
import { itemsPath } from "../itemWrites.js";
import { refused } from "../refused.js";
import { quotedList, quotedTerm } from "../quoted.js";
import { capabilitiesOn, readRecord, TIERS, type JoinedApp } from "./app.js";

export interface AskedCorrection {
  cid: string;
  itemId: string;
  /** The fields to write, as the caller sent them. Narrowed to strings by the tool, for the reason
   *  a submission is: a value of another JSON type would write a different document than the app's
   *  own page writes for the same answer. */
  values: Record<string, string>;
}

export type CorrectionOutcome =
  | { ok: true; fields: string[]; status: string }
  /** `refusal: false` means the write did not COMPLETE, which is not the same as not happening — a
   *  `deadline-exceeded` can arrive after Firestore committed. The caller must say so. */
  | { ok: false; error: string; refusal: boolean };

/** The status the record is in RIGHT NOW, or null when the collection has no status field on this
 *  tier — which is the same as saying nothing is correctable, since `selfUpdate` is declared per
 *  status and the rules read the current one before consulting it. */
const statusOf = (row: Record<string, unknown>, statusField: string | undefined): string | null => {
  if (statusField === undefined) return null;
  const held = row[statusField];
  return typeof held === "string" ? held : null;
};

/** What this reader may correct in this row, and on which tier — widest first, as `performIntent`
 *  does, and for the same reason: there is no page here to say which tier the ask came from, so
 *  each one this reader is admitted to is offered it and the first that carries it wins. */
function correctableFields(app: JoinedApp, cid: string, row: Record<string, unknown>): { fields: string[]; status: string } | null {
  for (const tier of TIERS) {
    const capability = capabilitiesOn(app, tier)[cid];
    if (capability === undefined) continue;
    // The status field travels with `selfUpdate` in the projection, so a capability carrying the
    // map carries the field the map is keyed by — but the ROW is what says which key applies.
    const status = statusOf(row, app.writes[tier]?.find((write) => write.cid === cid)?.statusField);
    if (status === null) continue;
    const fields = capability.correctFrom[status];
    if (fields !== undefined && fields.length > 0) return { fields, status };
  }
  return null;
}

/** Why this correction cannot be made, said in the DECLARATION's terms — never the rules', which
 *  answer afterwards and answer with one sentence for every reason there is. */
function whyNot(allowed: { fields: string[]; status: string } | null, asked: AskedCorrection): string | null {
  const sent = Object.keys(asked.values);
  if (sent.length === 0) return "`values` is empty — there is nothing to correct. Send the fields to change, keyed by their names as `describe` reported them.";
  if (allowed === null) {
    return (
      `${quotedTerm(asked.cid)} declares nothing you may correct in a record you submitted, or this record is in a status that allows none. ` +
      "Run `describe` to see what this app lets you change. Nothing was written."
    );
  }
  const outside = sent.filter((field) => !allowed.fields.includes(field));
  if (outside.length === 0) return null;
  return (
    `this record is ${quotedTerm(allowed.status)}, and in that status ${quotedTerm(asked.cid)} lets you correct only ${quotedList(allowed.fields)} — ` +
    `not ${quotedList(outside)}. Nothing was written; send only the fields it names, or move the record first if the app allows that.`
  );
}

/** Write the correction, as the signed-in person.
 *
 *  `new FieldPath(name)` for each field, and not the object form, for the reason `commitIntent` uses
 *  one: a dotted key is a NESTED PATH to `update`, so a field literally called `workflow.state`
 *  would have a map called `workflow` written beside the field the value actually lives in. The
 *  rules read the field the declaration names, so the write is refused — and where they did not, the
 *  record would be quietly corrupted. */
async function commitCorrection(aid: string, asked: AskedCorrection): Promise<{ error: string; refusal: boolean } | null> {
  try {
    const db = currentFirestore();
    const batch = writeBatch(db);
    const item = doc(collection(db, itemsPath(aid, asked.cid)), asked.itemId);
    // ONE update carrying every field, rather than one per field: the rules judge a write, and
    // `selfWriteOk` reads the whole diff. Split up, a correction touching two fields would be two
    // writes, either of which can be the one that fails — leaving the record half corrected with
    // nothing able to say which half.
    // Built as an explicit head-and-tail rather than a flattened array, because `update`'s
    // variadic form is typed `(field, value, ...more)` — a flat `unknown[]` needs an assertion to
    // fit it, and this repository does not take assertions where a shape can simply be built.
    const entries = Object.entries(asked.values);
    const [head, ...tail] = entries;
    if (head === undefined) return { error: "no fields to write", refusal: false };
    batch.update(item, new FieldPath(head[0]), head[1], ...tail.flatMap(([field, value]) => [new FieldPath(field), value]));
    await batch.commit();
    return null;
  } catch (err) {
    return { error: messageOf(err), refusal: refused(err) };
  }
}

export async function performCorrection(app: JoinedApp, asked: AskedCorrection): Promise<CorrectionOutcome> {
  const found = await readRecord(app, asked.cid, asked.itemId);
  if (!found.read) {
    return {
      ok: false,
      refusal: found.refusal,
      error: found.refusal
        ? "that record is not readable by you, so nothing here can say what state it is in — and `selfUpdate` is declared per status. Nothing was written."
        : `that record could not be read: ${found.why}. That is a failure, not a permission boundary — nothing was written, and the ask is worth making again.`,
    };
  }
  if (found.row === null) return { ok: false, refusal: true, error: `no record ${quotedTerm(asked.itemId)} in ${quotedTerm(asked.cid)}. Nothing was written.` };
  const allowed = correctableFields(app, asked.cid, found.row);
  const why = whyNot(allowed, asked);
  if (why !== null || allowed === null) return { ok: false, refusal: true, error: why ?? "nothing is correctable here." };
  const failed = await commitCorrection(app.aid, asked);
  if (failed !== null) return { ok: false, error: failed.error, refusal: failed.refusal };
  return { ok: true, fields: Object.keys(asked.values), status: allowed.status };
}
