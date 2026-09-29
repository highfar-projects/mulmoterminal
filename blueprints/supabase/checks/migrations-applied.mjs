// Every migration in supabase/migrations/ is applied to the linked production project: its version (the digits the file
// name starts with) is in the project's migration history. Read through the person's supabase login.
import { readdirSync } from "node:fs";
import { query } from "./supabase-cli.mjs";

const MIGRATIONS = "supabase/migrations";
const local = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => ({ file, version: file.split("_")[0] }));
try {
  const applied = new Set(query("--linked", "select version from supabase_migrations.schema_migrations").map((row) => String(row.version)));
  const missing = local.filter(({ version }) => !applied.has(version));
  if (missing.length > 0) {
    console.error(`not applied to the production database: ${missing.map(({ file }) => file).join(", ")} (yarn supabase db push)`);
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
