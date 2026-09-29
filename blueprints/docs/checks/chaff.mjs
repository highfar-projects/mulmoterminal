// Running chaff from a check, and reading what it found — shared by every usecase on the docs base.
// chaff itself comes from checks/chaff.sh next to this file, which pins the version and lets CHAFF_BIN
// stand in for it. A usecase's check loads this module from BLUEPRINT_BASE (see baseModule below).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chaffScript = () => join(import.meta.dirname, "chaff.sh");

export const runChaff = (args) => {
  const result = spawnSync("/bin/sh", [chaffScript(), ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/**
 * Every finding chaff reports for `target`, as { rule, level, file, line }. `extra` adds arguments (such as
 * `--experimental`). Throws when chaff did not produce SARIF.
 */
export const findingsIn = (target, extra = []) => {
  const dir = mkdtempSync(join(tmpdir(), "chaff-sarif-"));
  try {
    const sarif = join(dir, "out.sarif");
    const run = runChaff([target, ...extra, "--sarif", sarif, "--compact"]);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(sarif, "utf8"));
    } catch {
      throw new Error(`chaff did not report on ${target}:\n${run.stderr || run.stdout}`);
    }
    return (parsed.runs ?? []).flatMap((run) =>
      (run.results ?? []).map((result) => ({
        rule: String(result.ruleId ?? "").replace(/^chaff\//u, ""),
        level: String(result.level ?? "warning"),
        file: String(result.locations?.[0]?.physicalLocation?.artifactLocation?.uri ?? ""),
        line: Number(result.locations?.[0]?.physicalLocation?.region?.startLine ?? 0),
      })),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/** Findings a reader is asked to act on. `info` is a note, not a finding against the text. */
export const actionable = (finding) => finding.level === "error" || finding.level === "warning";

export const fail = (message) => {
  console.error(message);
  process.exit(1);
};

/** A JSON file the step was asked to write. A missing or broken one stops the check with what to fix. */
export const readJson = (path, shape) => {
  if (!existsSync(path)) fail(`${path} is missing: ${shape}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return fail(`${path} is not JSON (${err instanceof Error ? err.message : String(err)}): ${shape}`);
  }
};

/**
 * Problems with a list of quotations `[{ source, address, quote }]`: a malformed entry, a source that
 * `sourcePath` does not resolve (it returns a path, or a message saying why the source is refused), or a
 * quotation `chaff cite` does not find in its source. Quotations are checked one source at a time.
 * `label` prefixes each problem so the person can tell which list it came from.
 */
export const quotationProblems = (label, citations, sourcePath) => {
  if (!Array.isArray(citations)) return [`${label}: quotations must be an array`];
  const bad = citations.findIndex((entry) => typeof entry?.source !== "string" || typeof entry?.address !== "string" || typeof entry?.quote !== "string");
  if (bad !== -1) return [`${label}: entry ${bad + 1} needs "source", "address" and "quote"`];
  const bySource = new Map();
  citations.forEach((entry) => {
    const same = bySource.get(entry.source) ?? [];
    same.push(entry);
    bySource.set(entry.source, same);
  });
  const dir = mkdtempSync(join(tmpdir(), "cite-"));
  try {
    return [...bySource].flatMap(([source, entries]) => {
      const resolved = sourcePath(source);
      if (!resolved.path) return [`${label}: ${resolved.problem}`];
      const claims = join(dir, "claims.json");
      writeFileSync(claims, JSON.stringify(entries.map(({ address, quote }) => ({ address, quote }))));
      const run = runChaff(["cite", resolved.path, claims]);
      return run.code === 0 ? [] : [`${label}: quotations from ${source} are not in it:\n${run.stdout}${run.stderr}`];
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
