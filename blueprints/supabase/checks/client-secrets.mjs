// Reads the code a browser is given and fails when it carries a key that must stay on the server — a Supabase secret key
// or a service_role token — and, for the published page, when it talks to a Supabase other than the production one.
//
//   node client-secrets.mjs <build folder>                   the local build (dist/)
//   node client-secrets.mjs <https page URL> <supabase URL>   the published page, which must talk to that Supabase
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const TIMEOUT_MS = 20000;
const SECRET_KEY_RE = /sb_secret_[A-Za-z0-9_-]+/;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const LOCAL_STACK_RE = /(127\.0\.0\.1|localhost):5432\d/;
const SCRIPT_RE = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.js)"/g;

const roleOf = (jwt) => {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).role;
  } catch {
    return undefined;
  }
};

// What is wrong with one piece of client code, named by where it came from.
function secretProblems(where, text) {
  const problems = SECRET_KEY_RE.test(text) ? [`${where} carries a Supabase secret key (sb_secret_…); the browser must only get the publishable key`] : [];
  const serviceRole = [...text.matchAll(JWT_RE)].some(([jwt]) => roleOf(jwt) === "service_role");
  return serviceRole ? [...problems, `${where} carries a service_role key; the browser must only get the anon or publishable key`] : problems;
}

const CLIENT_FILE_RE = /\.(js|html|mjs|json|map)$/;
const filesUnder = (folder) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return filesUnder(full);
    return CLIENT_FILE_RE.test(entry.name) ? [full] : [];
  });

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function publishedProblems(page, supabaseUrl) {
  const html = await fetchText(page);
  const scripts = [...new Set([...html.matchAll(SCRIPT_RE)].map(([, src]) => new URL(src, page).href))];
  if (scripts.length === 0) return [`${page} loads no script to check`];
  const code = await Promise.all(scripts.map(async (url) => ({ url, text: await fetchText(url) })));
  const all = code.map(({ text }) => text).join("\n");
  return [
    ...secretProblems(page, html),
    ...code.flatMap(({ url, text }) => secretProblems(url, text)),
    ...(LOCAL_STACK_RE.test(all)
      ? [`the published code still talks to the local Supabase stack (${all.match(LOCAL_STACK_RE)[0]}); build it with the production settings`]
      : []),
    ...(all.includes(supabaseUrl) ? [] : [`the published code does not talk to ${supabaseUrl}, the Supabase named in .blueprint/supabase-url`]),
  ];
}

const [target, supabaseUrl] = process.argv.slice(2);
try {
  const problems = /^https?:\/\//.test(target ?? "")
    ? await publishedProblems(target, supabaseUrl)
    : filesUnder(target).flatMap((file) => secretProblems(file, readFileSync(file, "utf8")));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
