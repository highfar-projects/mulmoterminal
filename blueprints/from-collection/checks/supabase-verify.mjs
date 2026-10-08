// Reads Postgres and Storage through the Supabase CLI after `yarn import-source` and holds them against the copied
// source, rather than through the app: every collection's table has as many rows as it had records, every stored field
// of every record reads back equal, and every file a record points at is in the bucket with the source's bytes. Prints
// each mismatch, and exits 1 when there is any.
//
//   node supabase-verify.mjs --local --save-seeded <file>   before the import: the keys the seed put in each table
//   node supabase-verify.mjs --local --seeded <file>        the local stack a check filled, the seed's rows left out
//   node supabase-verify.mjs --linked                       production, through the person's supabase login
//
// The local database is reset to the migrations and the seed before the import, and the base's security check needs a
// seeded row in every table, so the seed's own rows are set aside before counting: a row whose key the seed wrote and no
// record has.
// The bucket the files went to is named in .blueprint/supabase-bucket. The CLI is the base pack's own runner.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { POSTGRES_STORE, SOURCE, pointedAtFiles, recordsOf, report, schemaOf, sourceCollections, tableOf, tableProblems } from "./compare.mjs";

const BUCKET_FILE = ".blueprint/supabase-bucket";
const [where, seedFlag, seedFile] = process.argv.slice(2);
const { query, run } = await import(pathToFileURL(path.join(process.env.BLUEPRINT_BASE ?? "", "checks", "supabase-cli.mjs")).href);

const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
const literal = (text) => `'${text.replaceAll("'", "''")}'`;

// Every row of the collection's table, or null when there is no such table.
function rowsOf(slug) {
  const table = tableOf(slug);
  const exists = query(where, `select 1 as found from pg_tables where schemaname = 'public' and tablename = ${literal(table)}`);
  return exists.length === 0 ? null : query(where, `select * from public.${quoted(table)}`);
}

// Whether the object holds the source file's bytes. A download that fails leaves an empty file behind, so the bytes are
// what is compared.
function sameObject(bucket, file, scratch) {
  const copy = path.join(scratch, "object");
  rmSync(copy, { force: true });
  const result = run(["storage", "cp", `ss:///${bucket}/${file}`, copy, where, "--experimental"]);
  if (result.status !== 0 || !existsSync(copy)) return false;
  return readFileSync(copy).equals(readFileSync(`${SOURCE}/files/${file}`));
}

function fileProblems() {
  const files = pointedAtFiles();
  if (files.length === 0) return [];
  if (!existsSync(BUCKET_FILE)) return [`the records point at ${files.length} files, and ${BUCKET_FILE} does not name the Storage bucket they went to`];
  const bucket = readFileSync(BUCKET_FILE, "utf8").trim();
  const scratch = mkdtempSync(path.join(os.tmpdir(), "bp-storage-"));
  try {
    return files.filter((file) => !sameObject(bucket, file, scratch)).map((file) => `${file} is not in the Storage bucket ${bucket} as the source has it`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const keyOf = (slug, row) => String(row[schemaOf(slug).primaryKey]);

// The keys of the rows the seed put in each collection's table.
const seededKeys = () => Object.fromEntries(sourceCollections().map((slug) => [slug, (rowsOf(slug) ?? []).map((row) => keyOf(slug, row))]));

// The table's rows without the seed's own: a key the seed wrote that no record has.
function withoutSeeded(slug, rows, seeded) {
  if (rows === null) return null;
  const records = new Set(recordsOf(slug).map((record) => keyOf(slug, record)));
  const seed = new Set(seeded[slug] ?? []);
  return rows.filter((row) => !seed.has(keyOf(slug, row)) || records.has(keyOf(slug, row)));
}

try {
  if (seedFlag === "--save-seeded") {
    writeFileSync(seedFile, JSON.stringify(seededKeys()));
  } else {
    const seeded = seedFlag === "--seeded" ? JSON.parse(readFileSync(seedFile, "utf8")) : {};
    report([
      ...sourceCollections().flatMap((slug) => tableProblems(slug, withoutSeeded(slug, rowsOf(slug), seeded), () => false, POSTGRES_STORE)),
      ...fileProblems(),
    ]);
  }
} catch (error) {
  report([error instanceof Error ? error.message : String(error)]);
}
