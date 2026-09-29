// Reads D1 and R2 through wrangler after `yarn import-source` and holds them against the copied source, rather than
// through the app: every collection's table has as many rows as it had records, every stored field of every record
// reads back equal, and every file a record points at is in the bucket with the source's bytes. Prints each mismatch,
// and exits 1 when there is any.
//
//   node d1-verify.mjs --local --persist-to <dir>   the local state a check filled
//   node d1-verify.mjs --remote                      production, with the person's wrangler login
//
// The bucket the files went to is named in .blueprint/r2-bucket, and must be one wrangler.jsonc binds.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { SOURCE, pointedAtFiles, report, sourceCollections, tableOf, tableProblems } from "./compare.mjs";

const PAGE_SIZE = 1000;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const BUCKET_FILE = ".blueprint/r2-bucket";
const location = process.argv.slice(2);

// The project's own wrangler, run with this node: the one its scripts run, without looking anything up on PATH.
function wranglerBin() {
  try {
    const manifest = createRequire(path.join(process.cwd(), "package.json")).resolve("wrangler/package.json");
    return path.join(path.dirname(manifest), JSON.parse(readFileSync(manifest, "utf8")).bin.wrangler);
  } catch {
    console.error("the project has no wrangler to read D1 and R2 with (add it as a dev dependency)");
    process.exit(1);
  }
}

const WRANGLER = wranglerBin();
const wrangler = (args) => spawnSync(process.execPath, [WRANGLER, ...args, ...location], { encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES });

// The rows a statement returns. wrangler prints JSON on stdout either way: a list of results, or { error: { text } }.
function query(sql) {
  const run = wrangler(["d1", "execute", "DB", "--json", "--command", sql]);
  const answer = (() => {
    try {
      return JSON.parse(run.stdout);
    } catch {
      return null;
    }
  })();
  if (run.status !== 0 || !Array.isArray(answer)) {
    throw new Error(`wrangler d1 execute ${location.join(" ")} failed on ${sql}: ${answer?.error?.text ?? (run.stderr.trim() || run.stdout.trim())}`);
  }
  return answer.flatMap((result) => result.results ?? []);
}

const quoted = (name) => `"${name.replaceAll('"', '""')}"`;
const literal = (text) => `'${text.replaceAll("'", "''")}'`;

function rowsOf(slug, offset = 0) {
  const table = tableOf(slug);
  if (offset === 0 && query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${literal(table)}`).length === 0) return null;
  const page = query(`SELECT * FROM ${quoted(table)} ORDER BY rowid LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
  return page.length < PAGE_SIZE ? page : [...page, ...rowsOf(slug, offset + PAGE_SIZE)];
}

// The bucket named in .blueprint/r2-bucket, if wrangler.jsonc binds it; otherwise the problem with it.
function bucketOf(fileCount) {
  if (!existsSync(BUCKET_FILE)) return { problem: `the records point at ${fileCount} files, and ${BUCKET_FILE} does not name the R2 bucket they went to` };
  const bucket = readFileSync(BUCKET_FILE, "utf8").trim();
  const config = existsSync("wrangler.jsonc") ? readFileSync("wrangler.jsonc", "utf8") : "";
  const bound = new RegExp(`"bucket_name"\\s*:\\s*${JSON.stringify(bucket).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(config);
  return bound ? { bucket } : { problem: `${BUCKET_FILE} names ${bucket}, which wrangler.jsonc does not bind in r2_buckets` };
}

// Whether the object holds the source file's bytes. wrangler exits 0 on a key that does not exist, and writes an empty
// file, so the bytes are what is compared.
function sameObject(bucket, file, scratch) {
  const copy = path.join(scratch, "object");
  rmSync(copy, { force: true });
  const run = wrangler(["r2", "object", "get", `${bucket}/${file}`, "--file", copy]);
  if (run.status !== 0 || /does not exist/.test(`${run.stdout}${run.stderr}`) || !existsSync(copy)) return false;
  return readFileSync(copy).equals(readFileSync(`${SOURCE}/files/${file}`));
}

function fileProblems() {
  const files = pointedAtFiles();
  if (files.length === 0) return [];
  const { bucket, problem } = bucketOf(files.length);
  if (problem) return [problem];
  const scratch = mkdtempSync(path.join(os.tmpdir(), "bp-r2-"));
  try {
    return files.filter((file) => !sameObject(bucket, file, scratch)).map((file) => `${file} is not in the R2 bucket ${bucket} as the source has it`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  report([...sourceCollections().flatMap((slug) => tableProblems(slug, rowsOf(slug))), ...fileProblems()]);
} catch (error) {
  report([error instanceof Error ? error.message : String(error)]);
}
