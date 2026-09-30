// Whether a linter finding is an open policy the spec declared on purpose. Supabase's linter warns about a policy whose
// using / with check is always true (rls_policy_always_true); a table the spec opens to everyone signed in has exactly
// that, with the reason written in .blueprint/public-access.json. Such a finding is set aside only when every command
// and every role the policy covers is declared there; anything else the linter says still fails.

const COMMANDS = { SELECT: ["select"], INSERT: ["insert"], UPDATE: ["update"], DELETE: ["delete"], ALL: ["select", "insert", "update", "delete"] };
// Which declared `who` covers a role: a policy for authenticated is what "signed-in" (or "anyone") allows; one for anon,
// or for public, reaches a signed-out visitor, which only "anyone" allows.
const WHO_FOR_ROLE = { authenticated: ["signed-in", "anyone"], anon: ["anyone"], public: ["anyone"] };

/** The declarations of .blueprint/public-access.json as "table operation who" keys; anything malformed declares nothing. */
export function declarationsOf(parsed) {
  const entries = Array.isArray(parsed?.access) ? parsed.access : [];
  return new Set(
    entries.filter((entry) => typeof entry?.reason === "string" && entry.reason.trim() !== "").map((entry) => `${entry.table} ${entry.operation} ${entry.who}`),
  );
}

/** Whether `finding` is an always-true policy in public whose every command and role is declared in `declared`. */
export function isDeclaredOpenPolicy(finding, declared) {
  const meta = finding?.metadata;
  if (finding?.name !== "rls_policy_always_true" || meta?.schema !== "public" || typeof meta.name !== "string") return false;
  const operations = COMMANDS[String(meta.command).toUpperCase()];
  const roles = Array.isArray(meta.roles) && meta.roles.length > 0 ? meta.roles : ["public"];
  if (!operations) return false;
  return operations.every((operation) => roles.every((role) => (WHO_FOR_ROLE[role] ?? []).some((who) => declared.has(`${meta.name} ${operation} ${who}`))));
}
