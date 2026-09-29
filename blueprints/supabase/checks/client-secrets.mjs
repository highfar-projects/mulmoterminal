// Reads the code a browser is given and fails when it carries a key that must stay on the server — a Supabase secret key
// or a service_role token — and, for the published page, when it talks to, or is allowed by its Content-Security-Policy
// to talk to, any Supabase other than the production one.
//
//   node client-secrets.mjs <folder or file> …               the local build (dist/), and the .env files
//   node client-secrets.mjs <https page URL> <supabase URL>   the published page, which must talk to that Supabase
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const TIMEOUT_MS = 20000;
const SECRET_KEY_RE = /sb_secret_[A-Za-z0-9_-]+/;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const LOCAL_STACK_RE = /(127\.0\.0\.1|localhost):5432\d/;
const SCRIPT_RE = /<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+\.js)"/g;
// A hosted Supabase host, whatever the scheme it is reached by (https for the API, wss for Realtime) or none (a CSP host
// source): <ref>.supabase.co (or .in), and *.supabase.co. Only the expected host is permitted; any other is reported.
const HOSTED_RE = /(?<![a-z0-9-])[a-z0-9*-]+\.supabase\.(?:co|in)\b/gi;
// CSP sources that let the page reach any host, another Supabase included.
const OPEN_SOURCES = new Set(["*", "http:", "https:", "ws:", "wss:"]);

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

async function fetchPage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return { text: await response.text(), csp: response.headers.get("content-security-policy") ?? "" };
}

// The sources a Content-Security-Policy lets the page connect to: connect-src, or default-src when it has none.
function connectSources(csp) {
  const directives = new Map(
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );
  return directives.get("connect-src") ?? directives.get("default-src") ?? [];
}

// Every hosted Supabase origin in a text other than the expected one.
const otherHosted = (text, expectedHost) =>
  [...new Set((text.match(HOSTED_RE) ?? []).map((host) => host.toLowerCase()))].filter((host) => host !== expectedHost);

function cspProblems(page, csp, expected) {
  if (!csp) return [`${page} is published without a Content-Security-Policy`];
  const sources = connectSources(csp).map((source) => source.replace(/\/$/, "").toLowerCase());
  const reaches = sources.includes(expected) ? [] : [`${page} does not let the page connect to ${expected}: ${csp}`];
  const others = [...sources.filter((source) => OPEN_SOURCES.has(source)), ...otherHosted(sources.join(" "), new URL(expected).host)];
  return others.length > 0 ? [...reaches, `${page} also lets the page connect to ${others.join(", ")}; only ${expected} may be allowed`] : reaches;
}

async function publishedProblems(page, supabaseUrl) {
  const expected = new URL(supabaseUrl).origin;
  const { text: html, csp } = await fetchPage(page);
  const scripts = [...new Set([...html.matchAll(SCRIPT_RE)].map(([, src]) => new URL(src, page).href))];
  if (scripts.length === 0) return [`${page} loads no script to check`];
  const code = await Promise.all(scripts.map(async (url) => ({ url, text: (await fetchPage(url)).text })));
  const all = code.map(({ text }) => text).join("\n");
  const others = otherHosted(all, new URL(expected).host);
  const local = all.match(LOCAL_STACK_RE);
  return [
    ...cspProblems(page, csp, expected),
    ...secretProblems(page, html),
    ...code.flatMap(({ url, text }) => secretProblems(url, text)),
    ...(local ? [`the published code still talks to the local Supabase stack (${local[0]}); build it with the production settings`] : []),
    ...(others.length > 0
      ? [`the published code names another Supabase (${others.join(", ")}); it must talk only to ${expected}, the one in .blueprint/supabase-url`]
      : []),
    ...(all.includes(expected) ? [] : [`the published code does not talk to ${expected}, the Supabase named in .blueprint/supabase-url`]),
  ];
}

const [target, supabaseUrl] = process.argv.slice(2);
// Every file under the folders named, and the files named as they are (an .env file is read whatever its name).
const localFiles = (paths) => paths.flatMap((item) => (statSync(item).isDirectory() ? filesUnder(item) : [item]));
try {
  const problems = /^https?:\/\//.test(target ?? "")
    ? await publishedProblems(target, supabaseUrl)
    : localFiles(process.argv.slice(2)).flatMap((file) => secretProblems(file, readFileSync(file, "utf8")));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
