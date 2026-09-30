// @vitest-environment node
// Which of the Supabase linter's findings the spec opened on purpose, as .blueprint/public-access.json declares them:
// the rule itself, and advisors.mjs applying it with a stand-in Supabase CLI that answers the linter and the catalogue.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { declarationsOf, isDeclaredOpenPolicy } from "../../../blueprints/supabase/checks/declared-open.mjs";

type Entry = { operation: string; who: string; table?: string; column?: unknown; reason?: unknown };

// An always-true policy, as the linter reports it.
const openPolicy = (command: string, roles: unknown, table = "books") => ({
  level: "WARN",
  name: "rls_policy_always_true",
  detail: `Table \`public.${table}\` has an RLS policy for \`${command}\` that allows unrestricted access.`,
  remediation: "https://example/lint",
  metadata: { name: table, schema: "public", command, roles },
});
const access = (entries: Entry[]) => ({ access: entries.map((entry) => ({ table: "books", reason: "shared on purpose", ...entry })) });
const declared = (entries: Entry[]) => declarationsOf(access(entries));
const every = (who: string) => ["select", "insert", "update", "delete"].map((operation) => ({ operation, who }));
// books has no user column; shelves has one, owner; loans has two.
const OWNERS = new Map<string, unknown>([
  ["books", []],
  ["shelves", ["owner"]],
  ["loans", ["lender", "borrower"]],
]);
const onShelves = (entries: Entry[]) => declared(entries.map((entry) => ({ table: "shelves", ...entry })));
const onLoans = (columns: string[]) =>
  declared(
    [{ operation: "insert", who: "signed-in" }, ...columns.map((column) => ({ operation: "insert-for-another", who: "signed-in", column }))].map((entry) => ({
      table: "loans",
      ...entry,
    })),
  );
const isSetAside = (finding: unknown, declarations: Set<string>) => isDeclaredOpenPolicy(finding, declarations, OWNERS);
const signedInInsert = declared([{ operation: "insert", who: "signed-in" }]);

describe("isDeclaredOpenPolicy", () => {
  it.each([
    ["a signed-in policy declared for signed-in people", openPolicy("INSERT", ["authenticated"]), signedInInsert],
    ["a signed-in policy declared for anyone", openPolicy("INSERT", ["authenticated"]), declared([{ operation: "insert", who: "anyone" }])],
    ["an anon policy declared for anyone", openPolicy("INSERT", ["anon"]), declared([{ operation: "insert", who: "anyone" }])],
    ["a policy with no role, declared for anyone", openPolicy("INSERT", []), declared([{ operation: "insert", who: "anyone" }])],
    ["a lower-case command", openPolicy("insert", ["authenticated"]), signedInInsert],
    ["an ALL policy with every command declared", openPolicy("ALL", ["anon", "authenticated"]), declared(every("anyone"))],
    [
      "an insert on a table with a user column, adding in another's name declared too",
      openPolicy("INSERT", ["authenticated"], "shelves"),
      onShelves([
        { operation: "insert", who: "signed-in" },
        { operation: "insert-for-another", who: "signed-in", column: "owner" },
      ]),
    ],
    [
      "an update on a table with a user column, moving a row into one's own name declared for anyone",
      openPolicy("UPDATE", ["authenticated"], "shelves"),
      onShelves([
        { operation: "update", who: "signed-in" },
        { operation: "update-owner", who: "anyone", column: "owner" },
      ]),
    ],
    ["a select on a table with a user column", openPolicy("SELECT", ["authenticated"], "shelves"), onShelves([{ operation: "select", who: "signed-in" }])],
    ["an insert on a table with two user columns, each declared", openPolicy("INSERT", ["authenticated"], "loans"), onLoans(["lender", "borrower"])],
  ])("sets aside %s", (_label, finding, declarations) => {
    expect(isSetAside(finding, declarations)).toBe(true);
  });

  const insertAndUpdate = [
    { operation: "insert", who: "signed-in" },
    { operation: "update", who: "signed-in" },
  ];
  it.each([
    ["a command not declared", openPolicy("UPDATE", ["authenticated"]), signedInInsert],
    ["an anon policy declared for signed-in people only", openPolicy("INSERT", ["anon"]), signedInInsert],
    ["a public policy declared for signed-in people only", openPolicy("INSERT", ["public"]), signedInInsert],
    ["a policy with no role, declared for signed-in people only", openPolicy("INSERT", []), signedInInsert],
    ["roles that are not a list", openPolicy("INSERT", "authenticated"), signedInInsert],
    ["a role nobody declares for", openPolicy("INSERT", ["service_role"]), declared(every("anyone"))],
    ["a role named like an object member", openPolicy("INSERT", ["constructor"]), declared(every("anyone"))],
    ["one role of two undeclared", openPolicy("INSERT", ["authenticated", "anon"]), signedInInsert],
    ["an ALL policy with one command undeclared", openPolicy("ALL", ["authenticated"]), declared(every("anyone").slice(0, 3))],
    ["an unknown command", openPolicy("TRUNCATE", ["authenticated"]), declared(every("anyone"))],
    ["a command named like an object member", openPolicy("constructor", ["authenticated"]), declared(every("anyone"))],
    [
      "an insert on a table with a user column, adding in another's name undeclared",
      openPolicy("INSERT", ["authenticated"], "shelves"),
      onShelves(insertAndUpdate),
    ],
    [
      "an update on a table with a user column, moving a row into one's own name undeclared",
      openPolicy("UPDATE", ["authenticated"], "shelves"),
      onShelves(insertAndUpdate),
    ],
    [
      "an insert where adding in another's name is declared for signed-in people only, on an anon policy",
      openPolicy("INSERT", ["anon"], "shelves"),
      onShelves([
        { operation: "insert", who: "anyone" },
        { operation: "insert-for-another", who: "signed-in", column: "owner" },
      ]),
    ],
    [
      "an ALL policy on a table with a user column, only the four commands declared",
      openPolicy("ALL", ["authenticated"], "shelves"),
      onShelves([...every("signed-in"), { operation: "insert-for-another", who: "signed-in", column: "owner" }]),
    ],
    [
      "a per-column declaration naming another column",
      openPolicy("INSERT", ["authenticated"], "shelves"),
      onShelves([
        { operation: "insert", who: "signed-in" },
        { operation: "insert-for-another", who: "signed-in", column: "editor" },
      ]),
    ],
    [
      "a table the catalogue does not list",
      openPolicy("INSERT", ["authenticated"], "rentals"),
      declared([{ operation: "insert", who: "signed-in", table: "rentals" }]),
    ],
    ["another lint", { ...openPolicy("INSERT", ["authenticated"]), name: "security_definer_view" }, signedInInsert],
    [
      "another schema",
      { ...openPolicy("INSERT", ["authenticated"]), metadata: { name: "books", schema: "storage", command: "INSERT", roles: ["authenticated"] } },
      signedInInsert,
    ],
    ["another table", openPolicy("INSERT", ["authenticated"]), declared([{ operation: "insert", who: "signed-in", table: "shelves" }])],
    ["no metadata", { name: "rls_policy_always_true" }, signedInInsert],
    ["nothing at all", null, signedInInsert],
    ["an insert on a table with two user columns, one declared", openPolicy("INSERT", ["authenticated"], "loans"), onLoans(["lender"])],
  ])("keeps %s", (_label, finding, declarations) => {
    expect(isSetAside(finding, declarations)).toBe(false);
  });
});

describe("declarationsOf", () => {
  it.each([" ", undefined, 1])("declares nothing for an entry whose reason is %j", (reason) => {
    expect(declared([{ operation: "insert", who: "signed-in", reason }]).size).toBe(0);
  });

  it("declares a per-column operation only with the column it names", () => {
    expect(declared([{ operation: "insert-for-another", who: "signed-in" }]).size).toBe(0);
    expect(declared([{ operation: "update-owner", who: "signed-in", column: 1 }]).size).toBe(0);
  });

  it.each([null, undefined, {}, { access: "all" }, [], { access: [null, 1, "x"] }])("declares nothing for %j", (parsed) => {
    expect(declarationsOf(parsed).size).toBe(0);
  });
});

const ADVISORS = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "supabase", "checks", "advisors.mjs");
const describeSh = describe.skipIf(process.platform === "win32");
// The linter's answer for `db advisors`, the catalogue's rows for `db query`.
const STANDIN_CLI = `const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "db" && args[1] === "advisors") { process.stdout.write(fs.readFileSync(process.env.STANDIN_ADVISORS, "utf8")); process.exit(1); }
if (args[0] === "db" && args[1] === "query") { process.stdout.write(JSON.stringify({ rows: JSON.parse(process.env.STANDIN_TABLES) })); process.exit(0); }
process.exit(2);
`;

describeSh("advisors.mjs with declared open policies", () => {
  let dir = "";
  const put = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "bp-supabase-advisors-"));
    put("package.json", JSON.stringify({ name: "stand-in", private: true }));
    put("node_modules/supabase/package.json", JSON.stringify({ name: "supabase", bin: { supabase: "dist/supabase.js" } }));
    put("node_modules/supabase/dist/supabase.js", STANDIN_CLI);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // The catalogue lists shelves with its user column the way Postgres's json_agg gives it back: as JSON text.
  const advisors = (findings: unknown[], entries: Entry[], tables = [{ table: "shelves", key: '["id"]', owners: '["owner"]', fixed: "[]" }]) => {
    put("advisors.json", JSON.stringify({ results: findings }));
    put(".blueprint/public-access.json", JSON.stringify(access(entries.map((entry) => ({ table: "shelves", ...entry })))));
    const result = spawnSync(process.execPath, ["--no-warnings", ADVISORS, "--local"], {
      cwd: dir,
      env: { ...process.env, STANDIN_ADVISORS: path.join(dir, "advisors.json"), STANDIN_TABLES: JSON.stringify(tables) },
      encoding: "utf8",
    });
    return { status: result.status, stderr: result.stderr };
  };
  const insert = { operation: "insert", who: "signed-in" };
  const forAnother = { operation: "insert-for-another", who: "signed-in", column: "owner" };

  it("sets aside an open insert once adding in another user's name is declared too, reading the user columns from the database", () => {
    const finding = openPolicy("INSERT", ["authenticated"], "shelves");
    expect(advisors([finding], [insert]).stderr).toContain("- WARN rls_policy_always_true: Table `public.shelves`");
    expect(advisors([finding], [insert, forAnother])).toEqual({ status: 0, stderr: "" });
  });

  it("sets nothing aside for a table the catalogue does not list", () => {
    expect(advisors([openPolicy("INSERT", ["authenticated"], "shelves")], [insert, forAnother], []).status).toBe(1);
  });

  it("still fails on every other finding beside a declared one", () => {
    const other = { level: "ERROR", name: "rls_disabled_in_public", detail: "Table `public.loans` is public", remediation: "https://example/lint" };
    const result = advisors([openPolicy("INSERT", ["authenticated"], "shelves"), other], [insert, forAnother]);
    expect(result.stderr).toContain("rls_disabled_in_public");
    expect(result.stderr).not.toContain("rls_policy_always_true");
  });
});
