// @vitest-environment node
// What a build's copy of its source would carry that may identify a person, which the form asks about once.
import { describe, expect, it } from "vitest";
import { CollectionSchemaZ } from "@mulmoclaude/core/collection/server";
import { carriesPersonalData, personalDataOf, personalFields, rosterSize } from "../../../common/blueprint/personalData";

const schemaWith = (fields: Record<string, object>) =>
  CollectionSchemaZ.parse({
    title: "People",
    icon: "person",
    dataPath: "data/people/items",
    primaryKey: "id",
    fields: { id: { type: "string", label: "ID", primary: true }, ...fields },
  });
const fieldsFound = (fields: Record<string, object>): string[] => personalFields("people", schemaWith(fields)).map((found) => found.field);

describe("personalFields", () => {
  it.each([
    ["an email field, whatever it is called", { contact: { type: "email", label: "Contact" } }],
    ["a text field keyed for a name", { name: { type: "string", label: "Who" } }],
    ["a camelCase key", { homePhone: { type: "string", label: "Given" } }],
    ["a snake_case key", { phone_number: { type: "string", label: "Number" } }],
    ["a kebab-case key", { "home-address": { type: "text", label: "Where" } }],
    ["a key that is the words run together", { fullname: { type: "string", label: "Who" } }],
    ["an English label", { contact: { type: "string", label: "Mobile" } }],
    ["a Japanese label", { a1: { type: "string", label: "氏名" } }],
    ["a Japanese label with more around it", { a2: { type: "text", label: "お届け先の住所" } }],
    ["a mail key that is not an email field", { mail: { type: "string", label: "Contact" } }],
    ["a birth date kept as text", { dob: { type: "string", label: "Born" } }],
  ])("finds %s", (_label, fields) => {
    expect(fieldsFound(fields)).toEqual(Object.keys(fields));
  });

  it.each([
    ["a text field named for something else", { title: { type: "string", label: "Title" } }],
    ["a word that only contains a personal one", { nameless: { type: "string", label: "Tone" }, hotel: { type: "string", label: "Stay" } }],
    ["a number named for a phone", { phone: { type: "number", label: "Phone" } }],
    ["a date named for a birthday", { birthday: { type: "date", label: "Birthday" } }],
    ["an enum named for a name", { name: { type: "enum", label: "Name", values: ["a", "b"] } }],
    ["markdown named for an address", { address: { type: "markdown", label: "Address" } }],
  ])("leaves out %s", (_label, fields) => {
    expect(fieldsFound(fields)).toEqual([]);
  });

  it("names each field with its collection and its label, in the schema's order", () => {
    const schema = schemaWith({ email: { type: "email", label: "Email" }, title: { type: "string", label: "Title" }, name: { type: "string", label: "Name" } });
    expect(personalFields("people", schema)).toEqual([
      { collection: "people", field: "email", label: "Email" },
      { collection: "people", field: "name", label: "Name" },
    ]);
  });
});

describe("rosterSize", () => {
  it("counts the addresses a shared app's roster is keyed by", () => {
    expect(rosterSize({ members: { "a@example.com": { "*": "owner" }, "b@example.com": {} } })).toBe(2);
  });

  it.each([null, undefined, "x", [], {}, { members: null }, { members: ["a@example.com"] }, { members: "a@example.com" }])("counts none in %j", (manifest) => {
    expect(rosterSize(manifest)).toBe(0);
  });
});

describe("personalDataOf", () => {
  const people = { slug: "people", schema: schemaWith({ email: { type: "email", label: "Email" } }) };
  const roster = { members: { "a@example.com": {} } };

  it("names the records' fields only when the records come, and the roster either way", () => {
    expect(personalDataOf([people], true, roster)).toEqual({ fields: [{ collection: "people", field: "email", label: "Email" }], members: 1 });
    expect(personalDataOf([people], false, roster)).toEqual({ fields: [], members: 1 });
    expect(personalDataOf([people], false, null)).toEqual({ fields: [], members: 0 });
  });

  it("carries personal data when there is a field or a member, and not otherwise", () => {
    expect(carriesPersonalData({ fields: [], members: 0 })).toBe(false);
    expect(carriesPersonalData({ fields: [], members: 1 })).toBe(true);
    expect(carriesPersonalData({ fields: [{ collection: "c", field: "f", label: "l" }], members: 0 })).toBe(true);
  });
});
