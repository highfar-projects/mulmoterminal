// @vitest-environment node
// The Supabase base's checks, run the way the executor runs them but against stand-ins: a Supabase CLI package that
// answers from what each test sets, a server that plays the local API (PostgREST and Auth) or the published page, and a
// Chrome that prints a fixed page. The stand-in API answers the way the real local stack did when these checks were
// written — above all, an insert that asks for the row back is also judged by the read policy. What is checked is the
// checks; the checks themselves were run against a real local stack when they were written.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHECKS = path.join(import.meta.dirname, "..", "..", "..", "blueprints", "supabase", "checks");
const describeSh = describe.skipIf(process.platform === "win32");
const PUBLISHABLE = "sb_publishable_standin";
const SECRET = "sb_secret_standin";
const LINKED_REF = "abcdefghijklmnopqrst";
const SUPABASE_URL = `https://${LINKED_REF}.supabase.co`;
const BUILD_ID = "build-1234";
// Each case starts several node processes (the check, the stand-in CLI, the render check), which a loaded runner takes
// seconds over.
const CHECK_TIMEOUT_MS = 90_000;
// A JWT whose payload says {"role":"service_role"}, and one that says {"role":"anon"}; the signatures are not checked.
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.c2lnbmF0dXJl`;

// "take-over": a signed-in stranger may change a row by setting its user columns to themselves. "insert-with-title": the
// insert policy opens only for a row that carries a title, as one gated on realistic values does.
type Operation = "select" | "insert" | "update" | "delete" | "insert-for-another" | "take-over" | "insert-with-title";
type Who = "anyone" | "signed-in";
const OPERATIONS: Operation[] = ["select", "insert", "update", "delete"];
const OWNER = "owner";
const SEED_OWNER = "00000000-0000-0000-0000-00000000a001";
const STRANGER_ID = "00000000-0000-0000-0000-00000000c001";

// What the stand-in answers. `open` lists what each kind of stranger gets through on the table; `seeded` is its row.
// `owners` are the columns naming a user; `insert-for-another` in `open` lets a stranger add a row naming someone else there.
let tables: { name: string; key: string[]; owners: string[]; seeded: Record<string, unknown> | null; open: Record<Who, Operation[]> }[] = [];
let page = {
  buildId: BUILD_ID,
  csp: `default-src 'self'; connect-src 'self' ${SUPABASE_URL}; frame-ancestors 'none'`,
  code: `createClient("${SUPABASE_URL}", "${PUBLISHABLE}")`,
};

const USER_TOKEN = "user-token";
const ADMIN_KEYS: ReadonlySet<unknown> = new Set([SECRET]);
function whoIs(req: IncomingMessage): Who | "admin" {
  if (ADMIN_KEYS.has(req.headers.apikey)) return "admin";
  return req.headers.authorization === `Bearer ${USER_TOKEN}` ? "signed-in" : "anyone";
}

type Answer = { status: number; body: unknown };

function restAnswer(req: IncomingMessage, url: URL, body: string): Answer {
  const table = tables.find(({ name }) => url.pathname === `/rest/v1/${name}`);
  if (!table) return { status: 404, body: { code: "PGRST205" } };
  const who = whoIs(req);
  const may = (operation: Operation) => who === "admin" || table.open[who].includes(operation);
  const rows = table.seeded ? [table.seeded] : [];
  if (req.method === "GET") return { status: 200, body: may("select") ? rows : [] };
  if (req.method === "POST") return insertAnswer(req, may, who, JSON.parse(body || "{}") as Record<string, unknown>, table.owners);
  if (req.method === "PATCH") return patchAnswer(table, who, may, JSON.parse(body || "{}") as Record<string, unknown>);
  // Changing and deleting a row goes through the read policy first, as it does in Postgres.
  const operation: Operation = "delete";
  return { status: 200, body: may(operation) && may("select") ? rows : [] };
}

// The admin's change is applied to the seeded row; a stranger setting every user column to themselves moves the row only
// where "take-over" is open, and any other change goes through the read policy first, as it does in Postgres.
function patchAnswer(table: (typeof tables)[number], who: Who | "admin", may: (operation: Operation) => boolean, changes: Record<string, unknown>): Answer {
  const rows = table.seeded ? [table.seeded] : [];
  const takingOver = table.owners.length > 0 && table.owners.every((column) => changes[column] === STRANGER_ID);
  if (who === "admin" || (takingOver && may("take-over"))) {
    if (table.seeded) Object.assign(table.seeded, changes);
    return { status: 204, body: "" };
  }
  if (takingOver) return { status: 204, body: "" };
  return { status: 200, body: may("update") && may("select") ? rows : [] };
}

// A row naming a user in one of its user columns names the seeded row's owner: the only user the probe adds rows for.
function insertAnswer(
  req: IncomingMessage,
  may: (operation: Operation) => boolean,
  who: Who | "admin",
  row: Record<string, unknown>,
  owners: string[],
): Answer {
  const refused = { status: who === "anyone" ? 401 : 403, body: { code: "42501", message: "new row violates row-level security policy" } };
  const forAnother = owners.some((column) => column in row);
  const opens = may("insert") || (may("insert-with-title") && typeof row.title === "string");
  if (!opens || (forAnother && !may("insert-for-another"))) return refused;
  // Returning the row needs the read policy too: Postgres refuses the whole insert when it cannot be read back.
  if (String(req.headers.prefer ?? "").includes("return=representation") && !may("select")) return refused;
  return { status: 400, body: { code: "23502", message: "null value violates not-null constraint" } };
}

function apiAnswer(req: IncomingMessage, url: URL, body: string): Answer {
  if (url.pathname === "/auth/v1/admin/users") return req.headers.apikey === SECRET ? { status: 200, body: { id: "u1" } } : { status: 401, body: {} };
  if (url.pathname === "/auth/v1/token") return { status: 200, body: { access_token: USER_TOKEN, user: { id: STRANGER_ID } } };
  if (url.pathname.startsWith("/rest/v1/")) return restAnswer(req, url, body);
  return { status: 404, body: {} };
}

let server: Server;
let origin = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const headers = { "content-security-policy": page.csp };
    if (url.pathname === "/blueprint-build.txt") return void res.writeHead(200, headers).end(page.buildId);
    if (url.pathname === "/assets/index.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(page.code);
    if (url.pathname === "/")
      return void res
        .writeHead(200, { ...headers, "content-type": "text/html" })
        .end('<html><body><div id="app"></div><script type="module" src="/assets/index.js"></script></body></html>');
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const { status, body } = apiAnswer(req, url, Buffer.concat(chunks).toString("utf8"));
      res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

// The stand-in CLI: `status -o json`, `db query <where> --output-format json <sql>` and `db advisors <where> …`, each
// answered from a JSON file the test writes, so what the CLI "says" is whatever the case needs.
const STANDIN_CLI = `const fs = require("node:fs");
const answers = JSON.parse(fs.readFileSync(process.env.STANDIN_ANSWERS, "utf8"));
const args = process.argv.slice(2);
function pick() {
  if (args[0] === "status") return answers.status;
  if (args[1] === "reset") return answers.reset;
  if (args[1] === "query" && /schema_migrations/.test(args.at(-1))) return args[2] === "--local" ? answers.localMigrations : answers.migrations;
  if (args[1] === "query") return answers.tables;
  return answers.advisors;
}
const reply = pick();
if (reply.stderr) process.stderr.write(reply.stderr);
process.stdout.write(reply.stdout ?? "");
process.exit(reply.status ?? 0);
`;

let dir = "";
const put = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  writeFileSync(path.join(dir, file), content, { mode: file.startsWith("bin/") ? 0o755 : 0o644 });
};
type Reply = { stdout?: string; stderr?: string; status?: number };
// `migrations` is production's history, `localMigrations` the local database's after the reset.
const answers: { status: Reply; tables: Reply; reset: Reply; migrations: Reply; localMigrations: Reply; advisors: Reply } = {
  status: {},
  tables: {},
  reset: {},
  migrations: {},
  localMigrations: {},
  advisors: {},
};
const APPLIED = { version: "20260929000000", statements: ["create table books ()", "alter table books enable row level security"] };
const rowsReply = (rows: unknown[]): Reply => ({ stdout: JSON.stringify({ boundary: "b", rows, warning: "w" }) });

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "bp-supabase-"));
  put("package.json", JSON.stringify({ name: "stand-in", private: true }));
  put("node_modules/supabase/package.json", JSON.stringify({ name: "supabase", bin: { supabase: "dist/supabase.js" } }));
  put("node_modules/supabase/dist/supabase.js", STANDIN_CLI);
  put("bin/chrome", '#!/bin/sh\necho "<html><body><p>本の一覧</p></body></html>"\n');
  tables = [
    { name: "books", key: ["id"], owners: [OWNER], seeded: { id: "b1", title: "One", [OWNER]: SEED_OWNER }, open: { anyone: [], "signed-in": ["insert"] } },
  ];
  page = {
    buildId: BUILD_ID,
    csp: `default-src 'self'; connect-src 'self' ${SUPABASE_URL}; frame-ancestors 'none'`,
    code: `createClient("${SUPABASE_URL}", "${PUBLISHABLE}")`,
  };
  answers.status = { stdout: JSON.stringify({ API_URL: origin, PUBLISHABLE_KEY: PUBLISHABLE, SECRET_KEY: SECRET }) };
  answers.tables = rowsReply(tables.map(({ name, key, owners }) => ({ table: name, key, owners })));
  answers.reset = {};
  answers.migrations = rowsReply([APPLIED]);
  answers.localMigrations = rowsReply([APPLIED]);
  answers.advisors = { stdout: JSON.stringify({ results: [], message: "db advisors" }) };
  put(
    ".blueprint/public-access.json",
    JSON.stringify({ access: [{ table: "books", operation: "insert", who: "signed-in", reason: "people add their own books" }] }),
  );
  put("supabase/migrations/20260929000000_books.sql", "create table books ();");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// The environment a check runs in: this one, minus a SUPABASE_PROJECT_ID the runner may carry, plus `extra`.
function checkEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "SUPABASE_PROJECT_ID"));
  return { ...inherited, CHROME: path.join(dir, "bin/chrome"), STANDIN_ANSWERS: path.join(dir, "answers.json"), ...extra };
}

const run = (command: string, args: string[], extra: Record<string, string> = {}) =>
  new Promise<{ status: number | null; stderr: string }>((resolve) => {
    writeFileSync(path.join(dir, "answers.json"), JSON.stringify(answers));
    const child = spawn(command, args, { cwd: dir, env: checkEnv(extra) });
    const errors: string[] = [];
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
    child.on("close", (status) => resolve({ status, stderr: errors.join("") }));
  });
const node = (script: string, ...args: string[]) => run(process.execPath, ["--no-warnings", path.join(CHECKS, script), ...args]);

describe("supabase: security-probe.mjs", { timeout: CHECK_TIMEOUT_MS }, () => {
  const probe = () => node("security-probe.mjs");

  it("passes when strangers get through only what public-access.json allows", async () => {
    expect(await probe()).toEqual({ status: 0, stderr: "" });
  });

  it.each(
    (["anyone", "signed-in"] as Who[]).flatMap((who) =>
      OPERATIONS.filter((operation) => !(who === "signed-in" && operation === "insert")).map((operation) => [who, operation] as const),
    ),
  )("reports a %s stranger who can %s", async (who, operation) => {
    // Changing and deleting a row goes through the read policy first, as it does in Postgres.
    tables[0].open[who] = [...tables[0].open[who], operation, ...(operation === "update" || operation === "delete" ? (["select"] as Operation[]) : [])];
    const result = await probe();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`does not allow ${operation} for ${who}`);
  });

  it("reports an insert the read policy would hide, by not asking for the row back", async () => {
    tables[0].open.anyone = ["insert"];
    expect((await probe()).stderr).toContain("a signed-out visitor can add a row");
  });

  it("lets what anyone may do pass for a signed-in user too", async () => {
    tables[0].open = { anyone: ["select"], "signed-in": ["select", "insert"] };
    put(
      ".blueprint/public-access.json",
      JSON.stringify({
        access: [
          { table: "books", operation: "select", who: "anyone", reason: "a public catalogue" },
          { table: "books", operation: "insert", who: "signed-in", reason: "own books" },
        ],
      }),
    );
    expect(await probe()).toEqual({ status: 0, stderr: "" });
  });

  it("reports a signed-in user who can add a row in the seeded owner's name, unless that column is declared", async () => {
    tables[0].open["signed-in"] = ["insert", "insert-for-another"];
    const result = await probe();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("can add a row in another user's name (owner set to the seeded row's)");
    put(
      ".blueprint/public-access.json",
      JSON.stringify({
        access: [
          { table: "books", operation: "insert", who: "signed-in", reason: "own books" },
          { table: "books", operation: "insert-for-another", column: OWNER, who: "signed-in", reason: "books are lent to someone" },
        ],
      }),
    );
    expect(await probe()).toEqual({ status: 0, stderr: "" });
  });

  it("reports a signed-in user who can move a row they can read into their own name, and puts the row back", async () => {
    tables[0].open["signed-in"] = ["insert", "select", "take-over"];
    put(
      ".blueprint/public-access.json",
      JSON.stringify({
        access: [
          { table: "books", operation: "insert", who: "signed-in", reason: "own books" },
          { table: "books", operation: "select", who: "signed-in", reason: "a shared catalogue" },
        ],
      }),
    );
    const result = await probe();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("can change a row the seed put there by setting owner to themselves");
    expect(tables[0].seeded?.[OWNER]).toBe(SEED_OWNER);
  });

  it("reports an insert that only a row with real values gets past, by also adding a copy of the seeded row", async () => {
    tables[0].open.anyone = ["insert-with-title"];
    expect((await probe()).stderr).toContain("a signed-out visitor can add a row (it got past row level security)");
  });

  it.each([
    ["an unseeded table", () => (tables[0].seeded = null), "books is empty after the seed"],
    ["a table without a primary key", () => (answers.tables = rowsReply([{ table: "books", key: [] }])), "books has no primary key"],
    [
      "a declaration without a reason",
      () => put(".blueprint/public-access.json", JSON.stringify({ access: [{ table: "books", operation: "insert", who: "signed-in" }] })),
      "gives no reason",
    ],
    [
      "a declaration with a blank reason",
      () => put(".blueprint/public-access.json", JSON.stringify({ access: [{ table: "books", operation: "insert", who: "signed-in", reason: "  " }] })),
      "gives no reason",
    ],
    [
      "a declaration naming no table",
      () => put(".blueprint/public-access.json", JSON.stringify({ access: [{ table: "nope", operation: "select", who: "anyone", reason: "x" }] })),
      "names no table in public",
    ],
    [
      "an insert-for-another naming a column that names no user",
      () =>
        put(
          ".blueprint/public-access.json",
          JSON.stringify({ access: [{ table: "books", operation: "insert-for-another", column: "title", who: "signed-in", reason: "x" }] }),
        ),
      "one of the columns of books that name a user (owner)",
    ],
    [
      "a declaration with another who",
      () => put(".blueprint/public-access.json", JSON.stringify({ access: [{ table: "books", operation: "select", who: "admins", reason: "x" }] })),
      "it is anyone or signed-in",
    ],
    ["a CLI that fails", () => (answers.tables = { status: 1, stderr: "cannot connect" }), "cannot connect"],
  ])("fails on %s", async (_label, change, message) => {
    change();
    const result = await probe();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("says so when the project has no Supabase CLI", async () => {
    rmSync(path.join(dir, "node_modules/supabase"), { recursive: true });
    expect((await probe()).stderr).toContain("the project has no Supabase CLI");
  });
});

describe("supabase: advisors.mjs", { timeout: CHECK_TIMEOUT_MS }, () => {
  it("passes when the linter finds nothing, and prints each finding when it does", async () => {
    expect(await node("advisors.mjs", "--local")).toEqual({ status: 0, stderr: "" });
    answers.advisors = {
      status: 1,
      stdout: JSON.stringify({
        results: [
          {
            level: "ERROR",
            name: "rls_disabled_in_public",
            detail: "Table `public.books` is public, but RLS has not been enabled.",
            remediation: "https://example/lint",
          },
        ],
      }),
    };
    const result = await node("advisors.mjs", "--linked");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("- ERROR rls_disabled_in_public: Table `public.books` is public");
  });

  it("fails when the linter does not answer", async () => {
    answers.advisors = { status: 1, stderr: "not logged in" };
    expect((await node("advisors.mjs", "--linked")).stderr).toContain("did not answer: not logged in");
  });
});

describe("supabase: migrations-applied.mjs", { timeout: CHECK_TIMEOUT_MS }, () => {
  it("passes when production applied every migration with the statements the local database recorded", async () => {
    expect(await node("migrations-applied.mjs")).toEqual({ status: 0, stderr: "" });
  });

  it.each([
    [
      "a migration not pushed",
      () => put("supabase/migrations/20261001000000_more.sql", "select 1;"),
      "not applied to the production database: 20261001000000_more.sql",
    ],
    [
      "a migration edited after it was pushed",
      () =>
        (answers.localMigrations = rowsReply([{ ...APPLIED, statements: [...APPLIED.statements, "create policy anyone on books for select using (true)"] }])),
      "20260929000000_books.sql differs from what production applied",
    ],
    [
      "a migration production has and the folder does not",
      () => (answers.migrations = rowsReply([APPLIED, { version: "20261002000000", statements: ["select 1"] }])),
      "production has applied migrations that supabase/migrations/ does not have: 20261002000000",
    ],
    ["a local database that cannot be reset", () => (answers.reset = { status: 1, stderr: "not running" }), "could not reset the local database"],
  ])("fails on %s", async (_label, change, message) => {
    change();
    const result = await node("migrations-applied.mjs");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

describe("supabase: linked-url.mjs", { timeout: CHECK_TIMEOUT_MS }, () => {
  const linkedUrl = (extra: Record<string, string> = {}) => run(process.execPath, ["--no-warnings", path.join(CHECKS, "linked-url.mjs"), SUPABASE_URL], extra);

  it("passes when the URL names the linked project, through the file or SUPABASE_PROJECT_ID", async () => {
    put("supabase/.temp/project-ref", `${LINKED_REF}\n`);
    expect(await linkedUrl()).toEqual({ status: 0, stderr: "" });
    rmSync(path.join(dir, "supabase/.temp"), { recursive: true });
    expect(await linkedUrl({ SUPABASE_PROJECT_ID: LINKED_REF })).toEqual({ status: 0, stderr: "" });
  });

  it("fails when SUPABASE_PROJECT_ID and the link file name different projects", async () => {
    put("supabase/.temp/project-ref", `${LINKED_REF}\n`);
    const result = await linkedUrl({ SUPABASE_PROJECT_ID: "zyxwvutsrqponmlkjihg" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("name different projects");
  });
});

describe("supabase: client-secrets.mjs", { timeout: CHECK_TIMEOUT_MS }, () => {
  it("passes a build with only the publishable or anon key, and fails one with a key that must stay on the server", async () => {
    put("dist/assets/index.js", `const a = "${PUBLISHABLE}"; const b = "${jwt("anon")}";`);
    expect(await node("client-secrets.mjs", "dist")).toEqual({ status: 0, stderr: "" });
    put("dist/assets/index.js", `const a = "${SECRET}";`);
    expect((await node("client-secrets.mjs", "dist")).stderr).toContain("carries a Supabase secret key");
    put("dist/assets/index.js", `const a = "${jwt("service_role")}";`);
    expect((await node("client-secrets.mjs", "dist")).stderr).toContain("carries a service_role key");
  });

  it("reads .env files named on their own, whatever name the key sits under", async () => {
    put("dist/assets/index.js", `const a = "${PUBLISHABLE}";`);
    put(".env.production", `VITE_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE}\n`);
    expect(await node("client-secrets.mjs", "dist", ".env.production")).toEqual({ status: 0, stderr: "" });
    put(".env.production", `VITE_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE}\nSERVICE_KEY=${jwt("service_role")}\n`);
    expect((await node("client-secrets.mjs", "dist", ".env.production")).stderr).toContain(".env.production carries a service_role key");
  });

  it.each([
    [
      "code that talks to another project, with the expected URL only as dead text",
      () => (page.code = `createClient("https://wrongwrongwrongwrong.supabase.co", "k"); const unused = "${SUPABASE_URL}";`),
      "names another Supabase (wrongwrongwrongwrong.supabase.co)",
    ],
    [
      "a CSP that also allows another project",
      () => (page.csp = `default-src 'self'; connect-src 'self' ${SUPABASE_URL} https://wrongwrongwrongwrong.supabase.co`),
      "also lets the page connect to wrongwrongwrongwrong.supabase.co",
    ],
    [
      "a CSP that allows every project",
      () => (page.csp = `default-src 'self'; connect-src 'self' ${SUPABASE_URL} https://*.supabase.co`),
      "also lets the page connect to *.supabase.co",
    ],
    [
      "code that opens Realtime on another project",
      () => (page.code = `createClient("${SUPABASE_URL}", "k"); new WebSocket("wss://wrongwrongwrongwrong.supabase.co/realtime/v1/websocket");`),
      "names another Supabase (wrongwrongwrongwrong.supabase.co)",
    ],
    [
      "a CSP that allows Realtime on every project",
      () => (page.csp = `default-src 'self'; connect-src 'self' ${SUPABASE_URL} wss://*.supabase.co`),
      "also lets the page connect to *.supabase.co",
    ],
    [
      "a CSP host source without a scheme for another project",
      () => (page.csp = `default-src 'self'; connect-src 'self' ${SUPABASE_URL} wrongwrongwrongwrong.supabase.co`),
      "also lets the page connect to wrongwrongwrongwrong.supabase.co",
    ],
    [
      "a CSP that lets the page connect anywhere over https",
      () => (page.csp = `default-src 'self'; connect-src 'self' ${SUPABASE_URL} https:`),
      "also lets the page connect to https:",
    ],
    ["no connect-src, with a default-src that does not name it", () => (page.csp = "default-src 'self'"), `does not let the page connect to ${SUPABASE_URL}`],
  ])("fails the published page with %s", async (_label, change, message) => {
    change();
    const result = await node("client-secrets.mjs", `${origin}/`, SUPABASE_URL);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("reads the published page's scripts: they talk to the production Supabase, not the local stack", async () => {
    expect(await node("client-secrets.mjs", `${origin}/`, SUPABASE_URL)).toEqual({ status: 0, stderr: "" });
    page.code = 'createClient("http://127.0.0.1:54321", "k")';
    const result = await node("client-secrets.mjs", `${origin}/`, SUPABASE_URL);
    expect(result.stderr).toContain("still talks to the local Supabase stack (127.0.0.1:54321)");
    expect(result.stderr).toContain(`does not talk to ${SUPABASE_URL}`);
  });
});

// The rest of the publish check talks to the published URL; with https required, it is exercised against the stand-in
// through a copy of the script whose scheme gate for the page URL accepts it. Only that one line differs; the gate on the
// Supabase URL stays as it is.
describeSh("supabase: deploy-check.sh against a stand-in page", { timeout: CHECK_TIMEOUT_MS }, () => {
  const deployCheck = () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), "bp-sb-check-"));
    const script = `sed 's#case "$url" in https://\\*) ;;#case "$url" in http://*|https://*) ;;#' "${path.join(CHECKS, "deploy-check.sh")}" > "${scratch}/deploy-check.sh" && cp "${CHECKS}"/*.mjs "${CHECKS}/page-renders.sh" "${scratch}/" && sh "${scratch}/deploy-check.sh"`;
    return run("/bin/sh", ["-c", script]).finally(() => rmSync(scratch, { recursive: true, force: true }));
  };
  beforeEach(() => {
    put(".blueprint/deploy-url", `${origin}\n`);
    put(".blueprint/supabase-url", `${SUPABASE_URL}\n`);
    put(".blueprint/build-id", BUILD_ID);
    put("supabase/.temp/project-ref", `${LINKED_REF}\n`);
  });

  it("passes when the page is this build, talks to production Supabase, renders, and production is migrated and clean", async () => {
    expect(await deployCheck()).toEqual({ status: 0, stderr: "" });
  });

  it.each([
    ["another build", () => (page.buildId = "build-old"), "serves build build-old, this deploy made build-1234"],
    ["a CSP that does not let it reach Supabase", () => (page.csp = "default-src 'self'"), `does not let the page connect to ${SUPABASE_URL}`],
    ["code built for the local stack", () => (page.code = 'createClient("http://127.0.0.1:54321", "k")'), "still talks to the local Supabase stack"],
    ["a secret key in the page", () => (page.code = `createClient("${SUPABASE_URL}", "${SECRET}")`), "carries a Supabase secret key"],
    ["a migration not pushed", () => put("supabase/migrations/20261001000000_more.sql", "select 1;"), "not applied to the production database"],
    [
      "a linter finding in production",
      () =>
        (answers.advisors = {
          status: 1,
          stdout: JSON.stringify({ results: [{ level: "ERROR", name: "rls_disabled_in_public", detail: "d", remediation: "r" }] }),
        }),
      "rls_disabled_in_public",
    ],
    [
      "a page that talks to another project than the one linked",
      () => put("supabase/.temp/project-ref", "zyxwvutsrqponmlkjihg\n"),
      "but this folder is linked to https://zyxwvutsrqponmlkjihg.supabase.co",
    ],
    ["a folder linked to no project", () => rmSync(path.join(dir, "supabase/.temp"), { recursive: true }), "is linked to no Supabase project"],
    [
      "a secret key in .env.production",
      () => put(".env.production", `VITE_SUPABASE_URL=${SUPABASE_URL}\nSUPABASE_SECRET_KEY=${SECRET}\n`),
      ".env.production carries a Supabase secret key",
    ],
  ])("fails with %s", async (_label, change, message) => {
    change();
    const result = await deployCheck();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
  });

  it("refuses a Supabase URL that is not https", async () => {
    put(".blueprint/supabase-url", "http://127.0.0.1:54321\n");
    expect((await deployCheck()).stderr).toContain(".blueprint/supabase-url is not an https URL");
  });
});

describeSh("supabase: handover.sh", { timeout: CHECK_TIMEOUT_MS }, () => {
  const URL = "https://books.example.workers.dev";
  const README = "yarn start で動かす。yarn deploy で公開する。yarn supabase db dump --linked --data-only -f backup.sql で控える。";
  const START = `# 使い始め方\n${URL} を開く\n- [ ] 本を登録する → 一覧に出る\n`;
  const handover = (readme: string) => {
    put("README.md", readme);
    put(".blueprint/start-here.md", START);
    put(".blueprint/deploy-url", `${URL}\n`);
  };

  it("passes when the README says how to run, publish and back up", async () => {
    handover(README);
    expect((await run("/bin/sh", [path.join(CHECKS, "handover.sh")])).status).toBe(0);
  });

  it("fails when the README does not say how to back up", async () => {
    handover(README.replace("db dump", "控え"));
    expect((await run("/bin/sh", [path.join(CHECKS, "handover.sh")])).stderr).toContain("(supabase db dump)");
  });
});
