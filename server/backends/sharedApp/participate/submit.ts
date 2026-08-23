// A submission made as one of the people the app is for.
//
// It is `previewWrite.ts` with the projection coming off Firestore instead of off disk, and that
// swap is the whole difference: the author previews the declaration they are about to publish, and
// this fills in the form of an app somebody else published. Everything between — which fields may
// be sent, what the record is, what its id is, whether a mirror travels with it — is
// `@receptron/sharedapp/view`'s, because a record built differently is a record the rules judge
// differently.
//
// WHAT IT REFUSES TO SAY. `stampField` fixes a position in a queue and the rules will not let it
// move afterwards, but a queue position is not a place: capacity cannot be counted by a rule
// (principle 3), so a create that succeeded has bought a RANK and not a seat. This module reports
// what it wrote and never that anything is secured; the narration beside it keeps that promise, and
// it is the promise an agent is most likely to break on the user's behalf.
import { randomUUID } from "node:crypto";
import { serverTimestamp } from "firebase/firestore";
import {
  missingIdField,
  missingRequired,
  plannedWrite,
  recordId,
  recordOf,
  writableFields,
  type DrawnForm,
  type SubmitSpec,
  type WritableField,
} from "@receptron/sharedapp/view";
import { isRecord } from "../../../../common/isRecord.js";
import { commitPlannedWrite } from "../itemWrites.js";
import { quotedList } from "../quoted.js";
import { submitSpecOf } from "../submitSpec.js";
import { formBlockOf, submitBlockOf, type JoinedApp } from "./app.js";

export interface SubmitPlan {
  submit: SubmitSpec;
  drawn: DrawnForm;
  fields: WritableField[];
  /** What the published form says each input IS, beyond its label — the `type` publish took from
   *  the schema, and an `enum`'s `values`.
   *
   *  KEPT FOR THE REPORT, NOT FOR THE WRITE. `writableFields` and `recordOf` read `label` and
   *  `required` and nothing else, so this changes no document. What it changes is what the agent is
   *  told: without the choices it fills an enum in from the field's NAME, and without the type it
   *  sends "next tuesday" to a date. Either lands as a record the rules accept and the app cannot
   *  use, which is worse than a refusal.
   *
   *  It is reported and NOT enforced, deliberately. A host that rejected a value outside `values`
   *  would be stricter than the deployed rules — which check `validate.keyFields`, not the schema's
   *  enum — and a submission they would have accepted is not this host's to refuse (principle 2:
   *  the checks here are diagnosis). */
  hints: Record<string, { type?: string; values?: string[] }>;
}

/** One collection's declaration and form out of `config/public`.
 *
 *  `form` is MulmoTerminal's own addition to that document (`publicForm.ts`) and is what makes this
 *  possible without the repository: `createFields` names the keys the rules accept, and the form
 *  names which of them a person actually answers and what to call them. Read key by key rather than
 *  asserted into shape — the projection types `submit` loosely on purpose, since the rules read
 *  those keys by the author's own names. */
export function submitPlan(app: JoinedApp, cid: string): SubmitPlan | null {
  const raw = submitBlockOf(app, cid);
  const drawnRaw = formBlockOf(app, cid);
  if (raw === null || drawnRaw === null) return null;
  const submit = submitSpecOf(raw);
  const drawn: DrawnForm = {
    fields: drawnFields(drawnRaw.fields),
    ...(typeof drawnRaw.statusField === "string" ? { statusField: drawnRaw.statusField } : {}),
  };
  return { submit, drawn, fields: writableFields(drawn, submit), hints: hintsOf(drawnRaw.fields) };
}

/** The type and the choices each published input carries, for the report. Same document as
 *  `drawnFields` and read separately because the package's `DrawnForm` has no room for them —
 *  which is right: they are not part of building the record. */
function hintsOf(raw: unknown): Record<string, { type?: string; values?: string[] }> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).flatMap(([name, spec]) => {
      if (!isRecord(spec)) return [];
      const type = typeof spec.type === "string" ? spec.type : undefined;
      const values = Array.isArray(spec.values) ? spec.values.filter((value): value is string => typeof value === "string") : undefined;
      if (type === undefined && values === undefined) return [];
      return [[name, { ...(type === undefined ? {} : { type }), ...(values === undefined || values.length === 0 ? {} : { values }) }]];
    }),
  );
}

/** The published form's inputs, rebuilt field by field.
 *
 *  Rebuilt rather than asserted, for the reason the whole config is read that way: this document
 *  was written by somebody else's publish, and a shape taken on trust is a shape that decides which
 *  boxes a person is asked to fill in. */
function drawnFields(raw: unknown): DrawnForm["fields"] {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([name, spec]) => [
      name,
      isRecord(spec)
        ? { ...(typeof spec.label === "string" ? { label: spec.label } : {}), ...(spec.required === true ? { required: true as const } : {}) }
        : {},
    ]),
  );
}

export type SubmitResult =
  | { ok: true; cid: string; id: string; mirror?: { cid: string; id: string } }
  /** `host` never reached Firestore, `taken` is an id somebody has, `rules` is a refusal, and
   *  `failed` is a write that broke — the last two are opposite advice and used to be one word. */
  | { ok: false; reason: "host" | "taken" | "rules" | "failed"; error: string };

/** Which of the four a failed write was. */
const submitReason = (failed: { error: string; refusal: boolean }): "taken" | "rules" | "failed" => {
  if (failed.error === "already-taken") return "taken";
  return failed.refusal ? "rules" : "failed";
};

/** Send one submission. */
export async function submitToApp(app: JoinedApp, cid: string, values: Record<string, string>): Promise<SubmitResult> {
  const plan = submitPlan(app, cid);
  if (plan === null)
    return {
      ok: false,
      reason: "host",
      error: `"${cid}" is not open for submission by this app — \`config/public\` declares no submit block and no form for it.`,
    };

  const missing = missingRequired(plan.fields, values);
  // QUOTED, because these are the published LABELS — the app author's own words, on their way into
  // a report the model reads. Quoting at the narration would have missed them: this string travels
  // to the agent whole.
  if (missing.length > 0) return { ok: false, reason: "host", error: `missing: ${quotedList(missing, " / ")}` };

  // `serverTimestamp` is what this host offers where the rules require GOOGLE's clock, and it is
  // handed over whether or not the app declares a `stampField` — that is the declaration's answer
  // rather than this module's.
  const record = recordOf(plan.fields, plan.drawn, plan.submit, values, { uid: app.handle.uid, email: app.handle.email }, serverTimestamp);

  // ASKED BEFORE THE ID IS BUILT, because both ways an absent id field goes wrong are silent:
  // `idFrom: "field"` produces `""`, and `auth.uid+field` produces `"<uid>_"` — a valid id, one per
  // person, so a second claim lands on the first one's document.
  const noId = missingIdField(plan.submit, record);
  if (noId !== undefined) return { ok: false, reason: "host", error: `no-id: the submission has no value for "${noId}", which its id is built from` };

  const id = recordId(plan.submit, app.handle.uid, record, randomUUID());
  const write = plannedWrite(cid, plan.submit, id, record);
  const failed = await commitPlannedWrite(app.handle, app.aid, write);
  if (failed !== null) return { ok: false, reason: submitReason(failed), error: failed.error };
  return { ok: true, cid, id, ...(write.mirror === undefined ? {} : { mirror: { cid: write.mirror.cid, id: write.mirror.id } }) };
}
