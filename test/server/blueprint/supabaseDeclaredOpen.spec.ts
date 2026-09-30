// @vitest-environment node
// Which of the Supabase linter's findings the spec opened on purpose, as .blueprint/public-access.json declares them.
import { describe, it, expect } from "vitest";
import { declarationsOf, isDeclaredOpenPolicy } from "../../../blueprints/supabase/checks/declared-open.mjs";

// An always-true policy on books, as the linter reports it.
const openPolicy = (command: string, roles: unknown, extra: Record<string, unknown> = {}) => ({
  level: "WARN",
  name: "rls_policy_always_true",
  metadata: { name: "books", schema: "public", command, roles },
  ...extra,
});
const declared = (entries: { operation: string; who: string; table?: string; reason?: unknown }[]) =>
  declarationsOf({ access: entries.map((entry) => ({ table: "books", reason: "shared on purpose", ...entry })) });
const signedInInsert = declared([{ operation: "insert", who: "signed-in" }]);
const everything = (who: string) => declared(["select", "insert", "update", "delete"].map((operation) => ({ operation, who })));

describe("isDeclaredOpenPolicy", () => {
  it.each([
    ["a signed-in policy declared for signed-in people", openPolicy("INSERT", ["authenticated"]), signedInInsert],
    ["a signed-in policy declared for anyone", openPolicy("INSERT", ["authenticated"]), declared([{ operation: "insert", who: "anyone" }])],
    ["an anon policy declared for anyone", openPolicy("INSERT", ["anon"]), declared([{ operation: "insert", who: "anyone" }])],
    ["a policy with no role, declared for anyone", openPolicy("INSERT", []), declared([{ operation: "insert", who: "anyone" }])],
    ["a lower-case command", openPolicy("insert", ["authenticated"]), signedInInsert],
    ["an ALL policy with every command declared", openPolicy("ALL", ["anon", "authenticated"]), everything("anyone")],
  ])("sets aside %s", (_label, finding, declarations) => {
    expect(isDeclaredOpenPolicy(finding, declarations)).toBe(true);
  });

  it.each([
    ["a command not declared", openPolicy("UPDATE", ["authenticated"]), signedInInsert],
    ["an anon policy declared for signed-in people only", openPolicy("INSERT", ["anon"]), signedInInsert],
    ["a public policy declared for signed-in people only", openPolicy("INSERT", ["public"]), signedInInsert],
    ["a policy with no role, declared for signed-in people only", openPolicy("INSERT", []), signedInInsert],
    ["roles that are not a list", openPolicy("INSERT", "authenticated"), signedInInsert],
    ["a role nobody declares for", openPolicy("INSERT", ["service_role"]), everything("anyone")],
    ["one role of two undeclared", openPolicy("INSERT", ["authenticated", "anon"]), signedInInsert],
    [
      "an ALL policy with one command undeclared",
      openPolicy("ALL", ["authenticated"]),
      declared(["select", "insert", "update"].map((operation) => ({ operation, who: "anyone" }))),
    ],
    ["an unknown command", openPolicy("TRUNCATE", ["authenticated"]), everything("anyone")],
    ["another lint", openPolicy("INSERT", ["authenticated"], { name: "security_definer_view" }), signedInInsert],
    [
      "another schema",
      { ...openPolicy("INSERT", ["authenticated"]), metadata: { name: "books", schema: "storage", command: "INSERT", roles: ["authenticated"] } },
      signedInInsert,
    ],
    ["another table", openPolicy("INSERT", ["authenticated"]), declared([{ operation: "insert", who: "signed-in", table: "authors" }])],
    ["no metadata", { name: "rls_policy_always_true" }, signedInInsert],
    ["nothing at all", null, signedInInsert],
  ])("keeps %s", (_label, finding, declarations) => {
    expect(isDeclaredOpenPolicy(finding, declarations)).toBe(false);
  });
});

describe("declarationsOf", () => {
  it("declares nothing for an entry without a reason, or with a blank one", () => {
    expect(declared([{ operation: "insert", who: "signed-in", reason: " " }]).size).toBe(0);
    expect(declared([{ operation: "insert", who: "signed-in", reason: undefined }]).size).toBe(0);
    expect(declared([{ operation: "insert", who: "signed-in", reason: 1 }]).size).toBe(0);
  });

  it.each([null, undefined, {}, { access: "all" }, [], { access: [null, 1, "x"] }])("declares nothing for %j", (parsed) => {
    expect(declarationsOf(parsed).size).toBe(0);
  });
});
