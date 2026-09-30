// What a build's copy of its source would carry that may identify a person: the fields of the copied records that may
// hold personal data, and the email addresses a shared app's roster is keyed by. The form asks once before copying them.
import type { CollectionSchema } from "@mulmoclaude/core/collection";
import { isRecord } from "../isRecord.js";

export type PersonalField = { collection: string; field: string; label: string };
export type PersonalData = { fields: PersonalField[]; members: number };

// Words in a field's key or label that name something identifying a person. A false alarm costs one confirmation; a
// miss copies someone's data unasked, so the list leans wide.
const PERSONAL_WORDS = new Set([
  "name",
  "firstname",
  "lastname",
  "fullname",
  "surname",
  "email",
  "mail",
  "phone",
  "tel",
  "telephone",
  "mobile",
  "address",
  "birthday",
  "birthdate",
  "birth",
  "dob",
  "zip",
  "postal",
  "postcode",
]);
const PERSONAL_PHRASES = ["氏名", "名前", "メール", "電話", "住所", "生年月日", "誕生日", "郵便番号"];
// Types that can hold personal data named by the field: free text, and a number or a date (a phone, a postal code, a
// birth date). An enum, a boolean, a reference or a derived value is not read by its name.
const NAMED_TYPES = new Set(["string", "text", "markdown", "number", "date", "datetime"]);

// `firstName`, `first_name`, `first-name`, `First name` all give "first", "name" — and "firstname" whole.
function wordsOf(text: string): string[] {
  const words = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word !== "");
  return [...words, words.join("")];
}

const namesAPerson = (text: string): boolean =>
  wordsOf(text).some((word) => PERSONAL_WORDS.has(word)) || PERSONAL_PHRASES.some((phrase) => text.includes(phrase));

type FieldSpec = { type: string; label: string; of?: Record<string, FieldSpec> };

const isPersonal = (key: string, spec: FieldSpec): boolean =>
  spec.type === "email" || (NAMED_TYPES.has(spec.type) && (namesAPerson(key) || namesAPerson(spec.label)));

// A field, and the columns of a table field under it as `table.column`: a row of a table is copied with its record.
function personalIn(slug: string, key: string, spec: FieldSpec, parentLabel = ""): PersonalField[] {
  const label = parentLabel === "" ? spec.label : `${parentLabel} / ${spec.label}`;
  const own = isPersonal(key, spec) ? [{ collection: slug, field: key, label }] : [];
  const columns = Object.entries(spec.of ?? {}).flatMap(([column, columnSpec]) => personalIn(slug, `${key}.${column}`, columnSpec, label));
  return [...own, ...columns];
}

/** The fields of a collection's records that may hold personal data: every email field, and fields named for one. */
export function personalFields(slug: string, schema: CollectionSchema): PersonalField[] {
  return Object.entries(schema.fields).flatMap(([key, spec]) => personalIn(slug, key, spec));
}

/** How many email addresses a shared app's declaration keys its roster by. */
export function rosterSize(manifest: unknown): number {
  const members = isRecord(manifest) ? manifest.members : undefined;
  return isRecord(members) ? Object.keys(members).length : 0;
}

/** What the copy would carry: the records' personal fields only when the records come too, the roster always. */
export const personalDataOf = (collections: readonly { slug: string; schema: CollectionSchema }[], records: boolean, manifest: unknown): PersonalData => ({
  fields: records ? collections.flatMap((collection) => personalFields(collection.slug, collection.schema)) : [],
  members: rosterSize(manifest),
});

export const carriesPersonalData = (data: PersonalData): boolean => data.fields.length > 0 || data.members > 0;
