// Production's migration history matches supabase/migrations/: every file is applied, with the statements the CLI
// records for it — read from the local database right after resetting it from the files, so both sides were split by
// the same parser — and production has applied nothing the folder lacks. A migration edited after it was pushed is
// caught here: db push skips a version it has seen, so the edit would never reach production. Production is read
// through the person's supabase login.
import { readdirSync } from "node:fs";
import { query, run } from "./supabase-cli.mjs";

const MIGRATIONS = "supabase/migrations";
const HISTORY = "select version, statements from supabase_migrations.schema_migrations order by version";

const statementsOf = (value) => JSON.stringify(typeof value === "string" ? JSON.parse(value) : (value ?? []));
const historyOf = (where) => new Map(query(where, HISTORY).map((row) => [String(row.version), statementsOf(row.statements)]));

function problems() {
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, version: file.split("_")[0] }));
  const reset = run(["db", "reset"]);
  if (reset.status !== 0)
    return [
      `could not reset the local database to read the migrations as the CLI records them (is it running? yarn db:start): ${(reset.stderr || reset.stdout).trim().slice(0, 300)}`,
    ];
  const local = historyOf("--local");
  const production = historyOf("--linked");
  const known = new Set(files.map(({ version }) => version));
  const missing = files.filter(({ version }) => !production.has(version));
  const edited = files.filter(({ version }) => production.has(version) && local.get(version) !== production.get(version));
  const extra = [...production.keys()].filter((version) => !known.has(version));
  return [
    ...(missing.length > 0 ? [`not applied to the production database: ${missing.map(({ file }) => file).join(", ")} (yarn supabase db push)`] : []),
    ...edited.map(
      ({ file }) =>
        `${file} differs from what production applied under its version: it was edited after it was pushed, and db push will not apply it again; undo the edit and put the change in a new migration (yarn supabase migration new)`,
    ),
    ...(extra.length > 0 ? [`production has applied migrations that supabase/migrations/ does not have: ${extra.join(", ")}`] : []),
  ];
}

try {
  const found = problems();
  if (found.length > 0) {
    console.error(found.join("\n"));
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
