// Supabase's own security linter over the local database (--local) or the linked production project (--linked): any
// warning or error fails, each printed as one line with where to read about it.
//
//   node advisors.mjs --local | --linked
import { run } from "./supabase-cli.mjs";

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
if (result.status !== 0 || findings.length > 0) {
  const lines = findings.map((finding) => `- ${finding.level} ${finding.name}: ${finding.detail} (${finding.remediation})`);
  console.error([`Supabase's security linter (supabase db advisors ${where} --type security) reports:`, ...lines].join("\n"));
  process.exit(1);
}
