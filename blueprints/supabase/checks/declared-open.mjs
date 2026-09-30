// Whether a linter finding is an open policy the spec declared on purpose. Supabase's linter warns about a policy whose
// using / with check is always true (rls_policy_always_true); a table the spec opens to everyone signed in has exactly
// that, with the reason written in .blueprint/public-access.json. Such a finding is set aside only when every command
// and every role the policy covers is declared there; anything else the linter says still fails.

const COMMANDS = { SELECT: ["select"], INSERT: ["insert"], UPDATE: ["update"], DELETE: ["delete"], ALL: ["select", "insert", "update", "delete"] };
// An always-true write lets the row name anyone in its user columns, which the security probe counts as operations of
// their own, declared per column: adding a row in another user's name, and moving a row into one's own.
const PER_COLUMN = { insert: "insert-for-another", update: "update-owner" };
// Which declared `who` covers a role: a policy for authenticated is what "signed-in" (or "anyone") allows; one for anon,
// or for public, reaches a signed-out visitor, which only "anyone" allows.
const WHO_FOR_ROLE = { authenticated: ["signed-in", "anyone"], anon: ["anyone"], public: ["anyone"] };

// Looks a name up in one of the tables above; a name like `constructor` must not reach Object's own members.
const own = (table, name) => (Object.hasOwn(table, name) ? table[name] : undefined);
const declarationKey = (table, operation, who, column = "") => `${table} ${operation} ${who} ${column}`;
const isPerColumn = (operation) => Object.values(PER_COLUMN).includes(operation);

/** The declarations of .blueprint/public-access.json as keys; anything without a reason, or malformed, declares nothing. */
export function declarationsOf(parsed) {
  const entries = Array.isArray(parsed?.access) ? parsed.access : [];
  return new Set(
    entries
      .filter((entry) => typeof entry?.reason === "string" && entry.reason.trim() !== "")
      .filter((entry) => !isPerColumn(entry.operation) || typeof entry.column === "string")
      .map((entry) => declarationKey(entry.table, entry.operation, entry.who, isPerColumn(entry.operation) ? entry.column : "")),
  );
}

// What the policy's `operation` lets a stranger do, as the [operation, column] declarations it needs.
const neededFor = (operation, owners) => [[operation, ""], ...(own(PER_COLUMN, operation) ? owners.map((column) => [PER_COLUMN[operation], column]) : [])];

/**
 * Whether `finding` is an always-true policy in public whose every command and role is declared in `declared`.
 * `ownersOf` maps each public table to the columns that name a user; a table it does not know is never set aside.
 */
export function isDeclaredOpenPolicy(finding, declared, ownersOf) {
  const meta = finding?.metadata;
  if (finding?.name !== "rls_policy_always_true" || meta?.schema !== "public" || typeof meta.name !== "string") return false;
  const operations = own(COMMANDS, String(meta.command).toUpperCase());
  const owners = ownersOf.get(meta.name);
  const roles = Array.isArray(meta.roles) && meta.roles.length > 0 ? meta.roles : ["public"];
  if (!operations || !Array.isArray(owners)) return false;
  const needed = operations.flatMap((operation) => neededFor(operation, owners));
  return needed.every(([operation, column]) =>
    roles.every((role) => (own(WHO_FOR_ROLE, role) ?? []).some((who) => declared.has(declarationKey(meta.name, operation, who, column)))),
  );
}
