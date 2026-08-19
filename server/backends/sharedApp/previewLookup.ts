// "HAVE I ALREADY GOT THIS ROW?", answered in the preview — for the one key the page names.
//
// `viewer.mine` carries the answer for every id strategy that can be LISTED, and for one it never
// can: `auth.uid+field` builds ids as `uid + "_" + <field>`, and the rules grant a submitter the
// document they can NAME rather than a range of them. The key is exactly what this side lacks and
// the page has — it is showing that question — so the answer is a read on demand.
//
// IT IS mulmoserver's `publicOwnLookup.ts`, PERFORMED AS THE AUTHOR. The id rule is the package's
// `recordId`, called with the same arguments in the same order, because the id a lookup asks about
// must be the one a submission would write: a second copy of that rule tells the page "no row"
// about a row it is about to be refused for.
//
// The uid half is NOT the page's to choose. It comes from the author's session here, so a page
// asking about a made-up key learns only that a row of its own does not exist.
//
// NOT KNOWING IS AN ANSWER, and it is a different one from "no". A collection whose ids cannot be
// built from a key, a read that was refused, an app that has never been published: all of those are
// `known: false` — nobody looked — and the parent must not turn them into "you have not answered",
// which takes a one-time action away from somebody entitled to it.
import { appSchemasPath } from "@receptron/sharedapp";
import { missingIdField, ownRow, recordId, type SubmitSpec } from "@receptron/sharedapp/view";

import type { PreviewLookupResult } from "../../../common/sharedAppPreview.js";
import { previewSharedApp } from "./preview.js";
import { sharedAppContext } from "./context.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The id half of a submit declaration, lifted out field by field.
 *
 *  The projection types `submit` loosely — the rules read those keys by the author's own names — and
 *  only these three decide an id. Read here rather than asserted into shape, so a declaration
 *  missing one becomes "nothing to look up" instead of a crash on the route. `createFields` rides
 *  along because `SubmitSpec` requires it and `recordId` never reads it. */
const idPartOf = (submit: Record<string, unknown>): SubmitSpec => ({
  createFields: [],
  ...(typeof submit.idFrom === "string" ? { idFrom: submit.idFrom } : {}),
  ...(typeof submit.idField === "string" ? { idField: submit.idField } : {}),
});

/** The strategies whose id this side can build from a key.
 *
 *  `auto` has none — the id was random and the record is unfindable by anything the page knows —
 *  and `field` names a record the page did not create, which is a different question from "mine". */
const buildsFromUid = (submit: SubmitSpec): boolean => submit.idFrom === "auth.uid" || submit.idFrom === "auth.uid+field";

/** The key, in the shape the id builder reads it from: a record with just that field. */
const carrying = (submit: SubmitSpec, key: string): Record<string, unknown> => {
  const field = submit.idField;
  if (typeof field !== "string") {
    return {};
  }
  return { [field]: key };
};

/** The document id this ask resolves to, or null for "nothing here can be looked up". */
const idFor = (submit: SubmitSpec, uid: string, key: string): string | null => {
  if (!buildsFromUid(submit) || uid === "") {
    return null;
  }
  const record = carrying(submit, key);
  // ASKED BEFORE THE ID IS BUILT, because `recordId` refuses a composite id whose field carries
  // nothing — it would otherwise answer `"<uid>_"`, which is a valid document id and the wrong row.
  if (missingIdField(submit, record) !== undefined) {
    return null;
  }
  // The SHARED builder, and the empty `unique` is the tell that nothing here falls back to a random
  // id: every strategy admitted above builds one from the uid.
  const id = recordId(submit, uid, record, "");
  if (id === "") {
    return null;
  }
  return id;
};

/** One ask, answered against the live database with the author's own credentials. */
export async function previewOwnLookup(root: string, ask: { cid: string; key: string }): Promise<PreviewLookupResult> {
  const context = await sharedAppContext(root);
  if (!context.ok) return { ok: false };
  const { handle } = context;

  const preview = await previewSharedApp(root);
  if (!preview.ok) return { ok: false };

  const declared = preview.config.submit?.[ask.cid];
  if (!isRecord(declared)) return { ok: false };
  const id = idFor(idPartOf(declared), handle.uid, ask.key);
  if (id === null) return { ok: false };

  // A THROWN read and an ABSENT document are the two answers this file exists to keep apart, and
  // collapsing them is the easy mistake: `get` answers null for "there is no such document", and a
  // refusal — the ordinary state of an app nobody has published — arrives as a rejection. Reading
  // both as "not found" tells the author's page they have not answered, which is the one thing a
  // lookup must never make up.
  const read = await handle.docs
    .get(`${appSchemasPath(preview.aid)}/${ask.cid}/items`, id)
    .then((doc) => ({ read: true as const, doc }))
    .catch(() => ({ read: false as const, doc: null }));
  if (!read.read) return { ok: false };
  const found = read.doc;
  if (found === null) return { ok: true, found: false };
  // PROJECTED, exactly as `viewer.mine` is: `ownRow` in the rules hands back the whole document,
  // and the status the app moved it to or the note a reviewer left is not the page's business. The
  // fields a page in this position could have SENT, plus the id.
  const fields = preview.formInputs[ask.cid] ?? [];
  return { ok: true, found: true, record: ownRow(fields, { ...(isRecord(found) ? found : {}), id }) };
}
