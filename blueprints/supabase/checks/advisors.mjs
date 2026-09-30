// Supabase's own security linter over the local database (--local) or the linked production project (--linked): any
// warning or error fails, each printed as one line with where to read about it — except a policy the spec opened on
// purpose and declared, with its reason, in .blueprint/public-access.json (declared-open.mjs).
//
//   node advisors.mjs --local | --linked
import { existsSync, readFileSync } from "node:fs";
import { declarationsOf, isDeclaredOpenPolicy } from "./declared-open.mjs";
import { publicTables } from "./public-tables.mjs";
import { run } from "./supabase-cli.mjs";

const ACCESS_FILE = ".blueprint/public-access.json";

const where = process.argv[2];
const result = run(["db", "advisors", where, "--type", "security", "--fail-on", "warn"]);
const findings = (() => {
  try {
    return JSON.parse(result.stdout).results ?? [];
  } catch {
    return null;
  }
})();
if (findings === null) {
  console.error(`supabase db advisors ${where} did not answer: ${(result.stderr || result.stdout).trim().slice(0, 400)}`);
  process.exit(1);
}
const declared = (() => {
  try {
    return declarationsOf(existsSync(ACCESS_FILE) ? JSON.parse(readFileSync(ACCESS_FILE, "utf8")) : null);
  } catch {
    return new Set();
  }
})();
// The user columns of each table, read only when there is an open policy to set aside; unreadable, nothing is set aside.
const ownersOf = (() => {
  if (!findings.some((finding) => finding?.name === "rls_policy_always_true")) return new Map();
  try {
    return new Map(publicTables(where).map(({ table, owners }) => [table, owners]));
  } catch {
    return new Map();
  }
})();
const reported = findings.filter((finding) => !isDeclaredOpenPolicy(finding, declared, ownersOf));
if (reported.length > 0 || (result.status !== 0 && findings.length === 0)) {
  const lines = reported.map((finding) => `- ${finding.level} ${finding.name}: ${finding.detail} (${finding.remediation})`);
  console.error([`Supabase's security linter (supabase db advisors ${where} --type security) reports:`, ...lines].join("\n"));
  process.exit(1);
}
