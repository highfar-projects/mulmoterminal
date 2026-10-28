// Marking the probe's own folder as trusted for Claude Code (#3206), in the login's own config.
//
// The probe sends no keys (#1293), so a trust dialog it meets can only time it out — and its folder
// (probe-cwd.ts) is one nobody runs `claude` in by hand, so without this every login on every
// machine would need a person to go there once and accept the dialog before the gauge showed
// anything. Claude Code keeps that answer as `projects[<dir>].hasTrustDialogAccepted` in its config
// file, and its own message for unattended use says to set exactly that; this writes it.
//
// This is NOT what #1293 removed. That was a blind Enter confirming the dialog in whatever folder the
// probe happened to be in — the user's — so a folder nobody approved got trusted. Here the folder is
// MulmoTerminal's own, created empty by the probe, so trusting it lets Claude Code read nothing it
// would not read anyway. Only that folder is ever written; a caller passing a user's directory would
// be a bug, not a feature.
//
// The file is Claude Code's, and Claude Code rewrites it while running, so the write is as small as
// it can be made: once per login per server (the caller remembers), only when the key is not already
// true, parsed and re-serialised in one step, and landed by rename so a reader never sees half a
// file. A write that cannot be made — no file yet (a login that has never run claude), unreadable,
// not JSON — does nothing, and the gauge's trust-prompt note stays as the fallback that says what to
// do by hand.
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isRecord } from "../../../common/isRecord.js";

const TRUST_KEY = "hasTrustDialogAccepted";
// Claude Code writes its config two-space indented; matching it keeps the rewrite a one-line diff.
const CONFIG_INDENT = 2;
const PERMISSION_BITS = 0o777;

/** What the config needs: nothing (already trusted), one rewrite, or nothing because it cannot be
 *  read as Claude Code's config at all. */
export type TrustEdit = { outcome: "trusted" } | { outcome: "write"; text: string } | { outcome: "unreadable" };

/** Pure: Claude Code's config with `projects[dir]` marked trusted. Keeps every other byte of meaning
 *  — key order, the entry's other fields, and whether the file ends in a newline — so the rewrite
 *  changes one field and nothing else. */
export function withProbeFolderTrusted(configText: string, dir: string): TrustEdit {
  let config: unknown;
  try {
    config = JSON.parse(configText);
  } catch {
    return { outcome: "unreadable" };
  }
  if (!isRecord(config)) return { outcome: "unreadable" };
  const projects = config.projects === undefined ? {} : config.projects;
  if (!isRecord(projects)) return { outcome: "unreadable" };
  const entry = projects[dir];
  if (isRecord(entry) && entry[TRUST_KEY] === true) return { outcome: "trusted" };
  const trusted = { ...projects, [dir]: { ...(isRecord(entry) ? entry : {}), [TRUST_KEY]: true } };
  const text = JSON.stringify({ ...config, projects: trusted }, null, CONFIG_INDENT);
  return { outcome: "write", text: configText.endsWith("\n") ? `${text}\n` : text };
}

/** Mark `dir` trusted in `configFile`, landed by rename. Returns whether the folder is trusted in
 *  that file once this returns — already, or now. */
export function ensureProbeFolderTrusted(configFile: string, dir: string): boolean {
  let edit: TrustEdit;
  let mode: number;
  try {
    mode = statSync(configFile).mode & PERMISSION_BITS;
    edit = withProbeFolderTrusted(readFileSync(configFile, "utf8"), dir);
  } catch {
    return false;
  }
  if (edit.outcome !== "write") return edit.outcome === "trusted";
  // Beside the file, so the rename is within one filesystem and therefore atomic.
  const tmp = path.join(path.dirname(configFile), `${path.basename(configFile)}.${process.pid}.mulmoterminal-tmp`);
  try {
    writeFileSync(tmp, edit.text, { mode });
    renameSync(tmp, configFile);
    return true;
  } catch {
    rmSync(tmp, { force: true });
    return false;
  }
}
