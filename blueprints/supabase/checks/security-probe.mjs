// Tries every table in the local stack's public schema the way a stranger would, through the same API the app uses: a
// signed-out visitor and a freshly signed-up user, neither of whom owns anything, each try to read, add, change and
// delete a row that the seed put there. Whatever gets through must be declared in .blueprint/public-access.json, with
// who may do it and why; anything else is reported. Row level security decides all of this, so it is judged by what
// the database lets through, not by reading the policies.
//
//   node security-probe.mjs      in the project folder, with the local stack running and the seed applied
import { existsSync, readFileSync } from "node:fs";
import { query, supabase } from "./supabase-cli.mjs";

const ACCESS_FILE = ".blueprint/public-access.json";
const OPERATIONS = ["select", "insert", "update", "delete"];
const WHO = ["anyone", "signed-in"];
const TIMEOUT_MS = 10000;
const RLS_REFUSED = "42501";
const STRANGER = { anyone: "a signed-out visitor", "signed-in": "a signed-in user who owns nothing" };
const DID = {
  select: "can read a row the seed put there",
  insert: "can add a row (an empty one got past row level security)",
  update: "can change a row the seed put there",
  delete: "can delete a row the seed put there",
};

// Every table in public, with the columns of its primary key.
function tables() {
  const rows = query(
    "--local",
    `select c.relname as "table", coalesce((select json_agg(a.attname order by a.attnum) from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = c.oid and i.indisprimary), '[]') as "key"
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`,
  );
  return rows.map((row) => ({ table: row.table, key: typeof row.key === "string" ? JSON.parse(row.key) : row.key }));
}

async function call(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  const body = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  })();
  return { status: response.status, body };
}

// What .blueprint/public-access.json allows, as "table operation who" keys; problems with the file itself are thrown.
function declared(known) {
  if (!existsSync(ACCESS_FILE)) return new Set();
  const parsed = JSON.parse(readFileSync(ACCESS_FILE, "utf8"));
  if (!Array.isArray(parsed?.access)) throw new Error(`${ACCESS_FILE} is not JSON with an "access" list`);
  return new Set(
    parsed.access.map((entry) => {
      const label = JSON.stringify(entry);
      if (!known.has(entry?.table)) throw new Error(`${ACCESS_FILE}: ${label} names no table in public`);
      if (!OPERATIONS.includes(entry.operation))
        throw new Error(`${ACCESS_FILE}: ${label} has operation ${JSON.stringify(entry.operation)}; it is one of ${OPERATIONS.join(", ")}`);
      if (!WHO.includes(entry.who)) throw new Error(`${ACCESS_FILE}: ${label} has who ${JSON.stringify(entry.who)}; it is anyone or signed-in`);
      if (typeof entry.reason !== "string" || entry.reason.trim() === "") throw new Error(`${ACCESS_FILE}: ${label} gives no reason`);
      return `${entry.table} ${entry.operation} ${entry.who}`;
    }),
  );
}

// Whether `who` may do `operation` on `table`: what anyone may do, a signed-in user may do too.
const allowed = (access, table, operation, who) => access.has(`${table} ${operation} ${who}`) || access.has(`${table} ${operation} anyone`);

async function signedInHeaders(api) {
  const email = `blueprint-probe-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const admin = { apikey: api.secret, "Content-Type": "application/json" };
  const created = await call(`${api.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (created.status >= 300) throw new Error(`could not create a user to probe with: ${created.status} ${JSON.stringify(created.body)}`);
  const token = await call(`${api.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: api.publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (token.status !== 200) throw new Error(`could not sign the probe user in: ${token.status} ${JSON.stringify(token.body)}`);
  return { apikey: api.publishable, Authorization: `Bearer ${token.body.access_token}` };
}

const filterOf = (key, row) => key.map((column) => `${encodeURIComponent(column)}=eq.${encodeURIComponent(String(row[column]))}`).join("&");
const wasRefused = (result) => result.body?.code === RLS_REFUSED;
const touchedRows = (result) => result.status < 300 && Array.isArray(result.body) && result.body.length > 0;

// What the stranger managed, per operation. A write that got through is put back with the secret key afterwards.
async function attempts(api, { table, key }, row, headers) {
  const rest = `${api.url}/rest/v1/${encodeURIComponent(table)}`;
  const one = `${rest}?${filterOf(key, row)}`;
  const writing = { ...headers, "Content-Type": "application/json", Prefer: "return=representation" };
  const column = Object.keys(row).find((name) => !key.includes(name)) ?? key[0];
  const read = await call(one, { headers });
  // An empty row: refused by row level security before any column is checked, or it got past it. Not asked to return the
  // row: returning it would also need the read policy, and an insert that went through would read as refused.
  const insert = await call(rest, { method: "POST", headers: { ...writing, Prefer: "return=minimal" }, body: "{}" });
  const update = await call(one, { method: "PATCH", headers: writing, body: JSON.stringify({ [column]: row[column] }) });
  const removed = await call(one, { method: "DELETE", headers: writing });
  if (touchedRows(removed))
    await call(rest, { method: "POST", headers: { apikey: api.secret, "Content-Type": "application/json" }, body: JSON.stringify(row) });
  return { select: touchedRows(read), insert: !wasRefused(insert), update: touchedRows(update), delete: touchedRows(removed) };
}

async function tableProblems(api, access, strangers, target) {
  const seeded = await call(`${api.url}/rest/v1/${encodeURIComponent(target.table)}?limit=1`, { headers: { apikey: api.secret } });
  const [row] = Array.isArray(seeded.body) ? seeded.body : [];
  if (target.key.length === 0) return [`${target.table} has no primary key, so no single row of it can be tried`];
  if (!row) return [`${target.table} is empty after the seed; supabase/seed.sql must put a row in it so the check can try reading it as a stranger`];
  const problems = [];
  for (const [who, headers] of strangers) {
    const managed = await attempts(api, target, row, headers);
    OPERATIONS.filter((operation) => managed[operation] && !allowed(access, target.table, operation, who)).forEach((operation) =>
      problems.push(`${target.table}: ${STRANGER[who]} ${DID[operation]}, and ${ACCESS_FILE} does not allow ${operation} for ${who}`),
    );
  }
  return problems;
}

async function main() {
  const status = JSON.parse(supabase(["status", "-o", "json"]));
  const api = { url: status.API_URL, publishable: status.PUBLISHABLE_KEY, secret: status.SECRET_KEY };
  const found = tables();
  const access = declared(new Set(found.map(({ table }) => table)));
  const strangers = [
    ["anyone", { apikey: api.publishable }],
    ["signed-in", await signedInHeaders(api)],
  ];
  const problems = [];
  for (const target of found) problems.push(...(await tableProblems(api, access, strangers, target)));
  return problems;
}

try {
  const problems = await main();
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
