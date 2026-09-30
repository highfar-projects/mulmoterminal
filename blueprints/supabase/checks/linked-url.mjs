// The Supabase the published page must talk to is the project this folder is linked to — the one the migration and
// linter checks read with --linked — so .blueprint/supabase-url has to name exactly that project. The project is found
// as the Supabase CLI finds it: SUPABASE_PROJECT_ID when it is set, otherwise supabase/.temp/project-ref, which
// `supabase link` writes.
//
//   node linked-url.mjs <supabase URL>
import { existsSync, readFileSync } from "node:fs";

const REF_FILE = "supabase/.temp/project-ref";
const REF_RE = /^[a-z0-9]{20}$/;

function problems(supabaseUrl) {
  const fromFile = existsSync(REF_FILE) ? readFileSync(REF_FILE, "utf8").trim() : "";
  const fromEnv = process.env.SUPABASE_PROJECT_ID ?? "";
  if (fromEnv && fromFile && fromEnv !== fromFile)
    return [`SUPABASE_PROJECT_ID (${fromEnv}) and ${REF_FILE} (${fromFile}) name different projects; the checks would read one and the page talk to another`];
  const ref = fromEnv || fromFile;
  if (!ref) return [`this folder is linked to no Supabase project (${REF_FILE} is missing); run yarn supabase link --project-ref <ref>`];
  if (!REF_RE.test(ref)) return [`the linked project ref ${JSON.stringify(ref)} is not a Supabase project ref`];
  const expected = `https://${ref}.supabase.co`;
  return new URL(supabaseUrl).origin === expected
    ? []
    : [
        `.blueprint/supabase-url is ${supabaseUrl}, but this folder is linked to ${expected}: the page would talk to one project while the migrations and the linter are checked on another`,
      ];
}

try {
  const found = problems(process.argv[2]);
  if (found.length > 0) {
    console.error(found.join("\n"));
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
