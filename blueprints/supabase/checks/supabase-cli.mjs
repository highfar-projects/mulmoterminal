// The project's own Supabase CLI, run with this node — the one its scripts run — without looking anything up on PATH.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function supabaseBin() {
  try {
    const manifest = createRequire(path.join(process.cwd(), "package.json")).resolve("supabase/package.json");
    const { bin } = JSON.parse(readFileSync(manifest, "utf8"));
    return path.join(path.dirname(manifest), typeof bin === "string" ? bin : bin.supabase);
  } catch {
    console.error("the project has no Supabase CLI to reach its database with (add supabase as a dev dependency)");
    process.exit(1);
  }
}

const SUPABASE = supabaseBin();

/** Runs the CLI: its exit status and what it printed. */
export const run = (args) => spawnSync(process.execPath, [SUPABASE, ...args], { encoding: "utf8" });

/** Runs the CLI and returns what it printed; a failure is thrown with what it said. */
export function supabase(args) {
  const result = run(args);
  if (result.status !== 0) throw new Error(`supabase ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim().slice(0, 400)}`);
  return result.stdout;
}

/** The rows one SQL statement returns, from the local database (`--local`) or the linked project (`--linked`). */
export const query = (where, sql) => JSON.parse(supabase(["db", "query", where, "--output-format", "json", sql])).rows ?? [];
