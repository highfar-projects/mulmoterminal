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
import { COMPUTED_TYPES, type CollectionFieldType, type CollectionSchema } from "@mulmoclaude/core/collection";
import type { AuthoredApp } from "@mulmoclaude/core/collection/server";
import type { LoadedCollection } from "@mulmoclaude/core/collection/server";
import type { StagedEntry } from "./staged.js";

/** The field types a STRANGER may be asked to fill in.
 *
 *  Deliberately a short list rather than "everything that is not computed". A public input has to
 *  survive two things a roster member's editor does not: it is drawn by a page that can read
 *  nothing but this projection, and whatever it produces is judged by the deployed rules with no
 *  host in between. `ref` needs the target collection (unreadable to a visitor), `table` needs a
 *  row sub-schema, `money` needs its currency configuration — publishing any of them as a bare
 *  `{label, type}` would draw an input that cannot be filled in correctly.
 *
 *  `enum` is here because its choices travel WITH it (`values`), which is exactly what makes it
 *  renderable. */
const PUBLIC_INPUT_TYPES: ReadonlySet<CollectionFieldType> = new Set<CollectionFieldType>([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "text",
  "email",
  "markdown",
  "enum",
]);

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

/** One collection's public form: the inputs, and the field the rules will insist the initial
 *  status lands in.
 *
 *  `statusField` is here because it is NOT `status` by default and NOT guessable: the create rule
 *  checks `collections[cid].statusField` and requires that field to equal `initialStatus`. A page
 *  that assumed the name would write the wrong key and be refused — and core's config projection
 *  carries the submit declaration but not the collection's rule configuration, so this is the only
 *  place a visitor can learn it. */
export interface PublicCollectionForm {
  fields: Record<string, PublicField>;
  statusField?: string;
}

export type PublicForm = Record<string, PublicCollectionForm>;

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
    if (Object.keys(fields).length === 0) return [];
    const statusField = authored.collections?.[cid]?.statusField;
    return [[cid, { fields, ...(statusField === undefined ? {} : { statusField }) }] as const];
  });
  return Object.fromEntries(entries);
}

/** What is wrong with the fields a declaration opens for public submission, in the author's terms.
 *
 *  This is a REFUSAL rather than a projection that quietly drops the field, because `createFields`
 *  is not only what the page draws from — it is the whitelist the deployed rules judge a public
 *  create by (`request.resource.data.keys().hasOnly(s.createFields)`). Dropping a computed field
 *  from the form would still leave the app accepting a written value for a field the host computes,
 *  from anybody on the internet, with nothing on the page to show for it.
 *
 *  Read against the WORKING TREE's schemas, which is what `declarationProblems` holds and what
 *  deploy is about to stage — so the answer arrives before the first write rather than at publish. */
export function publicInputProblems(app: AuthoredApp, collections: readonly LoadedCollection[]): string[] {
  const submit = app.public?.submit ?? {};
  const byCid = new Map(collections.map((collection) => [collection.slug, collection.schema]));
  return Object.entries(submit).flatMap(([cid, spec]) => {
    const schema = byCid.get(cid);
    if (schema === undefined) return [];
    return spec.createFields.flatMap((name) => problemWith(cid, name, schema));
  });
}

function problemWith(cid: string, name: string, schema: CollectionSchema): string[] {
  if (!Object.hasOwn(schema.fields, name)) return [];
  const spec = schema.fields[name];
  if (spec === undefined || PUBLIC_INPUT_TYPES.has(spec.type)) return [];
  const why = COMPUTED_TYPES.has(spec.type)
    ? `'${spec.type}' fields are computed by the host from the rest of the record, so a submitted value for one is never read and must never be accepted`
    : `'${spec.type}' fields need more than a label to fill in — the public page can read only the published form, not the schema, so it cannot draw one`;
  return [
    `public.submit.${cid}.createFields names '${name}', and ${why}. ` +
      `Remove '${name}' from createFields — it stays in the collection, it is just not something a stranger fills in.`,
  ];
}

function fieldsOf(schema: CollectionSchema, createFields: readonly string[], requiredBySubmit: readonly string[]): Record<string, PublicField> {
  const declared = schema.fields;
  const pairs = createFields.flatMap((name) => {
    // Own-property guarded: a `createFields` entry of `toString` or `constructor` must miss here
    // rather than read an Object.prototype member and publish a "field" nobody declared.
    if (!Object.hasOwn(declared, name)) return [];
    const spec = declared[name];
    if (spec === undefined) return [];
    // The same list the declaration is refused by, applied again where the drawing happens: a
    // projection that published an input it cannot describe would be a broken form either way.
    if (!PUBLIC_INPUT_TYPES.has(spec.type)) return [];
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

/** How much of the world-readable config document the projection may take up.
 *
 *  Firestore refuses a document over 1 MiB, and `config/public` carries core's settings projection
 *  as well as this form. A refusal from the database arrives mid-publish — after schemas have
 *  already been promoted — and says only that a document was too large; this says which app is too
 *  big to draw and stops before the first write. The margin is for the settings beside it. */
const PUBLIC_CONFIG_BUDGET = 700_000;

/** The refusal when the public config document would not fit, or null. */
export function oversizeProblem(config: unknown): string | null {
  const size = Buffer.byteLength(JSON.stringify(config) ?? "", "utf8");
  if (size <= PUBLIC_CONFIG_BUDGET) return null;
  return (
    `the public form comes to ${Math.round(size / 1000)} kB, and everything a visitor reads has to fit in one Firestore document (1 MB, shared with the app's settings). ` +
    "Publish fewer collections for public submission, or shorten the longest field labels and choice lists — the limit is on the form, not on the records."
  );
}
