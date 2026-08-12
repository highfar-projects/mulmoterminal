// What a stranger needs in order to fill in the form.
//
// The public page cannot read the schema. `schemaRead` is `readerOf || publicRead || partRead`,
// and the person answering a survey is none of those: they are not on the roster, and a
// submit-only collection is not in `public.read` — deliberately, because listing the answers is
// exactly what a survey must not do. So the labels, the types and the choices are unreachable, and
// the page would have field NAMES and nothing else to draw with.
//
// The one document a visitor may read is `apps/{aid}/config/*` (`allow read: if true`), which
// publish already writes. So the form's shape is published beside the settings — by MulmoTerminal,
// which writes that document, rather than by a change to the projection in `@mulmoclaude/core`.
//
// ONLY the fields the visitor may write. `createFields` is the rules' whitelist for a public
// create, so a field outside it cannot be submitted; publishing its label would put the app's
// internal vocabulary (`status`, a reviewer's note) on a world-readable document for nobody's
// benefit.
import type { CollectionSchema } from "@mulmoclaude/core/collection";
import type { AuthoredApp } from "@mulmoclaude/core/collection/server";
import type { StagedEntry } from "./staged.js";

/** One input, as the page will draw it. */
export interface PublicField {
  label: string;
  type: string;
  /** An `enum`'s choices, so the page renders a select rather than a text box. */
  values?: readonly string[];
  /** Whether a submission without it is refused.
   *
   *  The UNION of two declarations, because the rules and the app can each insist: the schema's
   *  own `required`, and `public.submit[cid].validate.required` — which is what the deployed rules
   *  actually check on a public create. Left out, the page cannot mark the field or stop the
   *  submit, and the visitor learns of it as a permission error with nothing naming the field. */
  required?: true;
}

export type PublicForm = Record<string, Record<string, PublicField>>;

/** The form spec for every collection the declaration opens for public submission.
 *
 *  Read from the STAGED schemas — the version publish is promoting — for the same reason the
 *  promotion itself is: what ships is what the roster reviewed, not what the working tree says
 *  now. */
export function publicFormOf(authored: AuthoredApp, staged: readonly StagedEntry[]): PublicForm {
  const submit = authored.public?.submit ?? {};
  const byCid = new Map(staged.map((entry) => [entry.cid, entry.doc.publishedSchema]));
  const entries = Object.entries(submit).flatMap(([cid, spec]) => {
    const schema = byCid.get(cid);
    if (schema === undefined) return [];
    const fields = fieldsOf(schema, spec.createFields, spec.validate?.required ?? []);
    // A collection whose `createFields` name nothing the schema declares publishes no entry at
    // all: an empty object would read as a form that failed to load, where absence is a fact the
    // page can state.
    return Object.keys(fields).length === 0 ? [] : [[cid, fields] as const];
  });
  return Object.fromEntries(entries);
}

function fieldsOf(schema: CollectionSchema, createFields: readonly string[], requiredBySubmit: readonly string[]): Record<string, PublicField> {
  const declared = schema.fields;
  const pairs = createFields.flatMap((name) => {
    // Own-property guarded: a `createFields` entry of `toString` or `constructor` must miss here
    // rather than read an Object.prototype member and publish a "field" nobody declared.
    if (!Object.hasOwn(declared, name)) return [];
    const spec = declared[name];
    if (spec === undefined) return [];
    // `values` belongs to the `enum` variant alone — read through a narrowing rather than off the
    // union, so a field type that gains choices later has to be added here on purpose.
    const values = "values" in spec ? spec.values : undefined;
    const required = spec.required === true || requiredBySubmit.includes(name);
    const field: PublicField = {
      label: spec.label,
      type: spec.type,
      ...(values === undefined ? {} : { values }),
      ...(required ? { required: true as const } : {}),
    };
    return [[name, field] as const];
  });
  return Object.fromEntries(pairs);
}
