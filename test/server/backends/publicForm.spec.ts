// @vitest-environment node
//
// The public page cannot read the schema — `schemaRead` is `readerOf || publicRead || partRead`,
// and the person answering a survey is none of those. So what it CAN read has to be enough to draw
// the form, and this is the projection that makes it so.
import { describe, it, expect } from "vitest";
import { parseAuthoredApp } from "@mulmoclaude/core/collection/server";
import { publicFormOf } from "../../../server/backends/sharedApp/publicForm.js";

const schema = {
  title: "Responses",
  icon: "reviews",
  primaryKey: "id",
  storage: { type: "firestore" as const },
  fields: {
    id: { type: "string" as const, label: "ID", primary: true, required: true },
    name: { type: "string" as const, label: "お名前" },
    score: { type: "enum" as const, label: "満足度", values: ["1", "2", "3", "4", "5"] },
    comment: { type: "text" as const, label: "ご感想" },
    status: { type: "string" as const, label: "状態" },
  },
};

const staged = [{ cid: "responses", doc: { publishedSchema: schema, deployedAt: 1, deployedBy: "o@e.com" } }];

const authored = (submit: Record<string, unknown>) => {
  const parsed = parseAuthoredApp(
    JSON.stringify({
      aid: "a1",
      members: { "o@e.com": { "*": "owner" } },
      collections: { responses: { submitOnly: true, statusField: "status" } },
      public: { enabled: true, read: [], submit },
    }),
  );
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.app;
};

const surveySubmit = {
  responses: { auth: "verifiedEmail", emailField: "email", createFields: ["name", "score", "comment"] },
};

describe("publicFormOf", () => {
  it("gives the page a label, a type and an enum's choices", () => {
    expect(publicFormOf(authored(surveySubmit), staged)).toEqual({
      responses: {
        name: { label: "お名前", type: "string" },
        score: { label: "満足度", type: "enum", values: ["1", "2", "3", "4", "5"] },
        comment: { label: "ご感想", type: "text" },
      },
    });
  });

  it("publishes only what the visitor may write", () => {
    // `createFields` is the rules' whitelist for a public create, so a field outside it cannot be
    // submitted — and publishing its label would put the app's internal vocabulary on a
    // world-readable document for nobody's benefit.
    const form = publicFormOf(authored(surveySubmit), staged);
    expect(Object.keys(form.responses ?? {})).not.toContain("status");
    expect(Object.keys(form.responses ?? {})).not.toContain("id");
  });

  it("marks a field the rules will insist on — from either declaration", async () => {
    // Two places can insist and the page has to honour both: the schema's own `required`, and
    // `public.submit[cid].validate.required`, which is what the deployed rules check on a public
    // create. Dropped, the visitor meets it as a permission error naming no field.
    const withRequired = {
      ...schema,
      fields: { ...schema.fields, name: { type: "string" as const, label: "お名前", required: true } },
    };
    const form = publicFormOf(
      authored({ responses: { auth: "verifiedEmail", emailField: "email", createFields: ["name", "score", "comment"], validate: { required: ["score"] } } }),
      [{ cid: "responses", doc: { publishedSchema: withRequired, deployedAt: 1, deployedBy: "o@e.com" } }],
    );
    expect(form.responses?.name).toMatchObject({ required: true });
    expect(form.responses?.score).toMatchObject({ required: true });
    // And nothing is marked that neither declaration asked for.
    expect(form.responses?.comment).not.toHaveProperty("required");
  });

  it("says nothing about a collection the app does not open", () => {
    expect(publicFormOf(authored({}), staged)).toEqual({});
  });

  it("skips a submit whose collection is not staged, rather than publishing an empty form", () => {
    // An empty entry reads as a form that failed to load; absence is a fact the page can state.
    expect(publicFormOf(authored({ waitlist: { auth: "verifiedEmail", emailField: "email", createFields: ["name"] } }), staged)).toEqual({});
  });

  it("ignores a createFields entry the schema does not declare", () => {
    // Including `toString`: an own-property guard is what keeps an Object.prototype member from
    // being published as a field nobody wrote.
    const form = publicFormOf(authored({ responses: { auth: "verifiedEmail", emailField: "email", createFields: ["name", "toString", "nope"] } }), staged);
    expect(form.responses).toEqual({ name: { label: "お名前", type: "string" } });
  });
});
