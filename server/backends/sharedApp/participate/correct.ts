// Correcting a record — the fourth thing `useSharedApp` can ask of one, and the only one that is
// not a MOVE.
//
// TWO PERMISSIONS, which are the rules' own two branches of `updateWith`. The SUBMITTER corrects
// their own row, in the fields `selfUpdate` names for the status it is in — that is what most of
// this file is about. A WRITER corrects any field of any row, because `isWriter(r)` sits beside
// that branch carrying no status condition and no field list at all. Only the first existed here,
// which meant an app declaring no `selfUpdate` — an ordinary blog, where nobody but the author
// writes — refused its own owner every correction while the rules allowed all of them.
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
import { isRecord } from "../../../../common/isRecord.js";
import { overLongFields } from "@receptron/sharedapp/view";

import { capabilitiesOn, readRecord, submitBlockOf, TIERS, type JoinedApp } from "./app.js";
import { submitSpecOf } from "../submitSpec.js";

export interface AskedCorrection {
  cid: string;
  itemId: string;
  /** The fields to write, as the caller sent them. Narrowed to strings by the tool, for the reason
   *  a submission is: a value of another JSON type would write a different document than the app's
   *  own page writes for the same answer. */
  values: Record<string, string>;
}

export type CorrectionOutcome =
  | { ok: true; fields: string[]; status?: string }
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

/** What this reader may correct in this row, and on which tier.
 *
 *  Every tier this reader is admitted to is offered the ask, as `performIntent` does and for the
 *  same reason: there is no page here to say which tier it came from.
 *
 *  WHAT IT CHOOSES ON is the ASK, not merely the first tier with anything to say. Taking the first
 *  non-empty answer made this host STRICTER THAN THE RULES for a reader admitted to both: where
 *  the member projection allows `note` and the roster's allows `guests`, an ask for `guests` was
 *  answered from the member tier and refused — while the rules, which read ONE declaration
 *  (`public.submit[cid].selfUpdate`, via `sub()`), would have accepted it.
 *
 *  The two tiers can only disagree because they are two DOCUMENTS: `runWrites` can stop after any
 *  write, so a tier's projection can be a publish behind `config/public`. Choosing the tier that
 *  covers the whole ask is what makes a half-finished publish cost nothing here.
 *
 *  It reports the WIDEST answer when nothing covers the ask, so the refusal names the most the
 *  reader could have sent rather than whichever tier was looked at first. */
/** What the DEPLOYED RULES will judge this correction by, when this reader can see it.
 *
 *  `selfWriteOk` reads `sub(a, cid)` and `col(a, cid)`, and both resolve out of `apps/{aid}` — not
 *  out of `config/public`, which is a projection of it, and not out of the tier documents, which
 *  are projections for an audience. The distinction is invisible until a publish stops part-way,
 *  and then it decides everything: the app document's `public` block is the LAST write publish
 *  makes, so during any interrupted run the rules are still judging by the PREVIOUS declaration
 *  while `config/public` and the tiers have already moved on.
 *
 *  Which is why the preflight prefers this and why deriving it from `config/public` would be the
 *  wrong direction — that document is written EARLIER than the tiers, so it is further ahead of
 *  the rules, not closer to them.
 *
 *  Null when it names nothing for this record's status — a REFUSAL, and the caller must not read it
 *  as "ask somewhere else". Whether the document was readable at all is `app.authorizing`, which
 *  the caller checks before this runs. */
function authorizedFields(
  held: { submit: Record<string, unknown>; collections: Record<string, unknown> },
  cid: string,
  row: Record<string, unknown>,
): { fields: string[]; status: string } | null {
  const submit = held.submit[cid];
  const collection = held.collections[cid];
  if (!isRecord(submit) || !isRecord(collection)) return null;
  const status = statusOf(row, typeof collection.statusField === "string" ? collection.statusField : undefined);
  if (status === null || !isRecord(submit.selfUpdate)) return null;
  const fields = submit.selfUpdate[status];
  if (!Array.isArray(fields)) return null;
  const named = fields.filter((field): field is string => typeof field === "string");
  return named.length === 0 ? null : { fields: named, status };
}

function correctableFields(app: JoinedApp, cid: string, row: Record<string, unknown>, asked: readonly string[]): { fields: string[]; status: string } | null {
  // The rules' own declaration wins outright where it is READABLE, and that includes when it says
  // no. Not merged with the tiers: a union would be looser than the rules and an intersection
  // stricter, and both would be answers about a document nobody judges by.
  //
  // The presence check is the whole point and it is not the same as a non-empty answer. Falling
  // through on an empty one puts a stale tier in front of a declaration that refuses: `apps/{aid}`
  // carrying `selfUpdate: {}` while a roster projection a publish behind still lists `note` would
  // send the batch, and the reader would get "Missing or insufficient permissions" for a field the
  // host had just told them they could correct. The tiers are for the reader who cannot read the
  // app document AT ALL — the collection-scoped role — with the mismatch that implies, which is
  // the one `performIntent` accepts and for the same reason: the rules answer last either way, and
  // what the host buys is a refusal with a name.
  const held = app.authorizing;
  if (held !== undefined) return authorizedFields(held, cid, row);
  const offered: { fields: string[]; status: string }[] = [];
  for (const tier of TIERS) {
    const capability = capabilitiesOn(app, tier)[cid];
    if (capability === undefined) continue;
    // The status field travels with `selfUpdate` in the projection, so a capability carrying the
    // map carries the field the map is keyed by — but the ROW is what says which key applies.
    const status = statusOf(row, app.writes[tier]?.find((write) => write.cid === cid)?.statusField);
    if (status === null) continue;
    const fields = capability.correctFrom[status];
    if (fields === undefined || fields.length === 0) continue;
    // The ask fits here: nothing further along could be more right, and a shorter list that also
    // covers it would only make a later refusal name fewer fields.
    if (asked.every((field) => fields.includes(field))) return { fields, status };
    offered.push({ fields, status });
  }
  return offered.toSorted((left, right) => right.fields.length - left.fields.length)[0] ?? null;
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

/** The length caps this app declares for a collection, from whichever document is readable.
 *
 *  THE APP DOCUMENT IS NOT REQUIRED HERE, and that is the difference between this and
 *  `authorizedFields` directly above. That one must read `apps/{aid}` because `selfWriteOk`
 *  reads it: the question there is what the DEPLOYED RULES will judge the write by, and during
 *  an interrupted publish `config/public` has moved on while the rules have not.
 *
 *  `maxBytes` is read by NO RULE. So there is no "what the rules will judge by" to agree with,
 *  and the question collapses to what the author published — which `config/public` states, world
 *  readably, and which this host already trusts for exactly this on the submit path.
 *
 *  Requiring the app document made the cap depend on the READER: a collection-scoped role cannot
 *  see `apps/{aid}`, so the same person was capped when they created a record and uncapped when
 *  they corrected it — through a `selfUpdate` the tier projection grants them. A cap that a
 *  second write escapes is not a cap, and correcting is the write where the length actually
 *  moves. */
function capsFor(app: JoinedApp, cid: string): Record<string, unknown> | null {
  const held = app.authorizing;
  // `Object.hasOwn` before the lookup: a collection id may be `constructor`, and a plain index
  // into a map that does not name it reaches Object.prototype.
  if (held !== undefined && Object.hasOwn(held.submit, cid)) {
    const declared = held.submit[cid];
    if (isRecord(declared)) return declared;
  }
  return submitBlockOf(app, cid);
}

/** Anything in this correction that is longer than the app allows.
 *
 *  A CORRECTION IS WHERE THE LENGTH ACTUALLY MOVES. A submission is written once; `selfUpdate` is
 *  the verb that lets the same person come back and make the field bigger, so a cap enforced only
 *  on create bounds the first version of an article and nothing after it. */
function overLong(app: JoinedApp, asked: AskedCorrection): string | null {
  const declared = capsFor(app, asked.cid);
  if (declared === null) return null;
  const over = overLongFields(asked.values, submitSpecOf(declared));
  if (over.length === 0) return null;
  return (
    `too long for ${quotedTerm(asked.cid)}: ` +
    over.map((field) => `${quotedTerm(field.name)} is ${field.bytes} bytes and this app allows ${field.cap}`).join("; ") +
    ". Nothing was written. Bytes of UTF-8, not characters — Japanese runs about 2.4 bytes a character."
  );
}

/** Does this reader's ROLE let them rewrite any field here?
 *
 *  The other half of the rules' `updateWith`, and the half `selfUpdate` cannot express: `isWriter`
 *  carries no status condition and no field list, so a writer's permission is a BOOLEAN and every
 *  attempt to enumerate it describes a narrowing the rules do not apply.
 *
 *  Without it an owner could not correct their own app's records through this tool at all. An
 *  ordinary blog declares no `selfUpdate` — nobody but the author writes there — so
 *  `authorizedFields` answers null for the one person the rules let rewrite everything, and the
 *  agent instruction telling them they may was false.
 *
 *  Every tier is asked, as `correctableFields` asks them and for the same reason: there is no page
 *  here to say which one the ask came from. `correctAny` is itself tier-guarded inside the package.
 */
function writesAnyField(app: JoinedApp, cid: string): boolean {
  return TIERS.some((tier) => capabilitiesOn(app, tier)[cid]?.correctAny === true);
}

/** The fields the rules FROZE when the record was created — the stamp, the field an id was built
 *  out of, the uid.
 *
 *  Checked for everybody and BEFORE the role, because no role makes them writable: `stampHeld`,
 *  `idHeld` and `uidHeld` are conjuncts of `updateWith`, ahead of the branch that asks who is
 *  asking. Before `correctAny` existed this could not be reached — publish refuses a `selfUpdate`
 *  naming any of them — and a writer naming one has no such gate in front of it. */
function frozenIn(app: JoinedApp, cid: string): string[] {
  return TIERS.flatMap((tier) => app.writes[tier]?.find((write) => write.cid === cid)?.frozen ?? []);
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

/** The field this collection's status lives in — from the declaration THE RULES READ, where that is
 *  readable.
 *
 *  `apps/{aid}` first, for `authorizedFields`' reason and with a sharper consequence. A publish that
 *  stops after the tiers and before the app document leaves the two disagreeing, and this guard is
 *  what keeps a correction from setting a status. Read off the tiers alone, an author who RENAMED
 *  the field mid-publish would have the guard looking for `workflow.state` while the rules still
 *  judge by `status` — and an update naming `status` would sail past it and be COMMITTED through
 *  the unrestricted writer branch, going round the transition table and the notice bound to the
 *  move. That is the one direction this whole file must not fail in. (Codex on #1870.)
 *
 *  Presence is what decides, empty included: an app document that is readable and names no
 *  `statusField` for this collection means there is none, not "ask somewhere else".
 *
 *  The tiers answer only for the reader who cannot read `apps/{aid}` at all — the collection-scoped
 *  role — with the mismatch that implies, which is the one this module accepts everywhere else.
 *
 *  `frozen` beside it is left on the projection deliberately: the same drift there fails the other
 *  way. A frozen field the tiers name and the rules do not is a refusal the host makes and the
 *  rules would not; one the rules freeze and the tiers omit is a permission error rather than a
 *  write that should not have happened. */
function statusFieldOf(app: JoinedApp, cid: string): string | undefined {
  const held = app.authorizing;
  // `Object.hasOwn` before the lookup: a collection id may be `constructor`.
  if (held !== undefined && Object.hasOwn(held.collections, cid)) {
    const declared = held.collections[cid];
    if (isRecord(declared)) return typeof declared.statusField === "string" ? declared.statusField : undefined;
  }
  if (held !== undefined) return undefined;
  return TIERS.map((tier) => app.writes[tier]?.find((write) => write.cid === cid)?.statusField).find((field) => field !== undefined);
}

/** The fields the OTHER asks own, and which an update may therefore never write — whoever asks.
 *
 *  Not frozen: both of them move. They move through `transition` and `assign`, and each of those is
 *  more than a write. A transition is judged against the declared table and carries whatever notice
 *  the declaration names for that move. An assignment refuses an address nobody on the roster holds
 *  an assignable role at — writing one produces a row NOBODY may touch afterwards, which is the
 *  whole reason that check exists. A correction able to set either goes round a check the rules do
 *  NOT make, so nothing downstream would catch it. (Codex on #1870.)
 *
 *  The assignee is read off the tier projections and the status is not (`statusFieldOf` prefers the
 *  app document): `collections[cid].assigneeField` is not carried on the tier the rules read here,
 *  and the drift fails in the safe direction anyway — an assignee field the tiers name and the
 *  rules do not is a refusal this host makes and the rules would have allowed, which is a message
 *  rather than a write that should not have happened. */
function reservedIn(app: JoinedApp, cid: string): string[] {
  const assignee = TIERS.map((tier) => app.writes[tier]?.find((write) => write.cid === cid)?.assigneeField).find((field) => field !== undefined);
  return [statusFieldOf(app, cid), assignee].filter((field): field is string => field !== undefined);
}

/** Why those fields are refused, said as the ask that owns each one — the actionable half is which
 *  OTHER call to make, not that this one said no. */
function whyReserved(reserved: string[], app: JoinedApp, cid: string): string {
  const status = statusFieldOf(app, cid);
  const named = reserved.map((field) =>
    field === status
      ? `${quotedTerm(field)} is this collection's status, and a status moves through \`transition\` — judged against the declared table, carrying whatever notice the declaration names for that move`
      : `${quotedTerm(field)} is this collection's assignee, and an assignee moves through \`assign\` — which refuses an address nobody on the roster holds a role at, because writing one produces a row nobody may touch afterwards`,
  );
  return `${named.join("; ")}. An update sets neither. Nothing was written.`;
}

/** May this reader write these fields, and what did the record say when it was read?
 *
 *  THE ROLE FIRST, because it is the rules' own order and because it answers without a list: a
 *  writer is not narrowed per status, so there is nothing for `whyNot` to compare and a status is
 *  reported only where the collection has one. Everybody else falls through to the submitter's
 *  half, which is where the field list and the status both come from. */
function permitted(app: JoinedApp, asked: AskedCorrection, row: Record<string, unknown>): { ok: true; status?: string } | { ok: false; error: string } {
  if (writesAnyField(app, asked.cid)) {
    const status = statusOf(row, statusFieldOf(app, asked.cid));
    return status === null ? { ok: true } : { ok: true, status };
  }
  const allowed = correctableFields(app, asked.cid, row, Object.keys(asked.values));
  const why = whyNot(allowed, asked);
  if (why !== null || allowed === null) return { ok: false, error: why ?? "nothing is correctable here." };
  return { ok: true, status: allowed.status };
}

export async function performCorrection(app: JoinedApp, asked: AskedCorrection): Promise<CorrectionOutcome> {
  // BEFORE the record is read, and before either permission is asked: an ask naming no fields has
  // nothing to judge and nothing to write, and an `update` carrying an empty object succeeds
  // without writing anything — which would be reported as a correction that happened.
  if (Object.keys(asked.values).length === 0) {
    return {
      ok: false,
      refusal: true,
      error: "`values` is empty — there is nothing to correct. Send the fields to change, keyed by their names as `describe` reported them.",
    };
  }
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
  const frozen = Object.keys(asked.values).filter((field) => frozenIn(app, asked.cid).includes(field));
  if (frozen.length > 0) {
    return {
      ok: false,
      refusal: true,
      error:
        `${quotedList(frozen)} cannot be rewritten: the rules fixed ${frozen.length === 1 ? "it" : "them"} when the record was created — the server clock a queue ` +
        "is ranked by, the field the record's id was built out of, or the uid that says whose row it is. Nobody may write these afterwards, this app's owner " +
        "included. Nothing was written. A record that needs a different id is a new record.",
    };
  }
  const reserved = reservedIn(app, asked.cid).filter((field) => Object.hasOwn(asked.values, field));
  if (reserved.length > 0) {
    return { ok: false, refusal: true, error: whyReserved(reserved, app, asked.cid) };
  }
  const judged = permitted(app, asked, found.row);
  if (!judged.ok) return { ok: false, refusal: true, error: judged.error };
  const tooLong = overLong(app, asked);
  if (tooLong !== null) return { ok: false, refusal: true, error: tooLong };
  const failed = await commitCorrection(app.aid, asked);
  if (failed !== null) return { ok: false, error: failed.error, refusal: failed.refusal };
  return { ok: true, fields: Object.keys(asked.values), ...(judged.status === undefined ? {} : { status: judged.status }) };
}
