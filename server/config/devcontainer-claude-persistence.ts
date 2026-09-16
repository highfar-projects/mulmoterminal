// A gap specific to how Claude Code lays out its own state, hit only by a devcontainer.json that
// tries to persist it across rebuilds by hand: `~/.claude/` (transcripts, credentials, backups) is
// a directory a named volume can cover, but Claude Code's main config file, `~/.claude.json`, is a
// SIBLING of that directory — outside it — so mounting `.claude` alone leaves `.claude.json` on the
// container's own ephemeral filesystem, wiped on every rebuild. `~/.claude/backups/` (Claude Code's
// own periodic backups of that file) survives because it IS inside the mounted directory, which is
// what makes the failure mode so confusing: the backups are right there, but nothing restores them.
//
// Detected and fixed here rather than left to a person noticing it project by project — this is a
// personal fork, and this gap already cost a real conversation history once (grucha, 2026-09).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { parse as parseJsonc, modify, applyEdits } from "jsonc-parser";
import { isRecord } from "../../common/isRecord.js";
import { runningDevcontainerName } from "./devcontainer-flag.js";

function devcontainerJsonPath(dir: string): string | null {
  const nested = path.join(dir, ".devcontainer", "devcontainer.json");
  if (existsSync(nested)) return nested;
  const flat = path.join(dir, ".devcontainer.json");
  return existsSync(flat) ? flat : null;
}

// devcontainer.json's own mount syntax: comma-separated `key=value` pairs in one string
// ("source=x,target=y,type=volume") — there is no structured form, so this is the only way in.
function mountTargets(mounts: unknown): string[] {
  if (!Array.isArray(mounts)) return [];
  return mounts.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const match = /(?:^|,)\s*target=([^,]+)/.exec(entry);
    return match?.[1] ? [match[1]] : [];
  });
}

export interface ClaudePersistenceGap {
  configPath: string;
  /** Where the mount actually lands, e.g. `/home/vscode/.claude` — read off the mount itself
   *  rather than assumed from `remoteUser`, so a container root user or an unusual home still
   *  resolves correctly. */
  claudeDirTarget: string;
  /** The sibling this mount does NOT cover: `${claudeDirTarget}.json`. */
  claudeJsonTarget: string;
}

/** Whether `dir`'s devcontainer.json has this gap: a `.claude` directory mounted as a persistent
 *  volume, with no sign that `postCreateCommand` already accounts for the `.claude.json` sibling.
 *  Null for a directory with no devcontainer config, no such mount (most projects — this is only
 *  reachable by a devcontainer.json that hand-rolls Claude Code persistence in the first place),
 *  or one that already mentions `.claude.json` (already fixed, or fixed some other way). */
export function detectClaudeJsonPersistenceGap(dir: string): ClaudePersistenceGap | null {
  const configPath = devcontainerJsonPath(dir);
  if (!configPath) return null;
  let config: unknown;
  try {
    config = parseJsonc(readFileSync(configPath, "utf8"));
  } catch {
    return null; // unparsable config is someone else's problem to fix first
  }
  if (!isRecord(config)) return null;
  const claudeDirTarget = mountTargets(config.mounts).find((target) => target.endsWith("/.claude"));
  if (!claudeDirTarget) return null;
  const postCreate = config.postCreateCommand;
  if (typeof postCreate === "string" && postCreate.includes(".claude.json")) return null;
  return { configPath, claudeDirTarget, claudeJsonTarget: `${claudeDirTarget}.json` };
}

// Idempotent and safe to run on every container start, not just once: past the first run,
// CLAUDE_JSON_PERSISTED already exists (inside the volume), so this only re-links `.claude.json`
// to it — cheap, and correct regardless of what a fresh container's own image happens to seed
// `.claude.json` with (measured on grucha: the same small stub every rebuild, going by its
// unchanging mtime — almost certainly baked into a cached image layer, not written at boot).
//
// Preferring the newest BACKUP over whatever `.claude.json` already exists in a fresh container is
// deliberate: a real login's config runs tens of KB, and a same-looking stub the image seeds every
// time would otherwise get "migrated" first and permanently shadow the actual history sitting one
// directory over.
function persistenceFixScript(claudeJsonTarget: string, claudeDirTarget: string): string {
  const persisted = `${claudeDirTarget}/.claude.json`;
  const backupDir = `${claudeDirTarget}/backups`;
  return (
    `CLAUDE_JSON=${claudeJsonTarget}; CLAUDE_JSON_PERSISTED=${persisted}; BACKUP_DIR=${backupDir}; ` +
    `if [ ! -e "$CLAUDE_JSON_PERSISTED" ]; then ` +
    `LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/.claude.json.backup.* 2>/dev/null | head -1); ` +
    `if [ -n "$LATEST_BACKUP" ]; then cp "$LATEST_BACKUP" "$CLAUDE_JSON_PERSISTED"; ` +
    `elif [ -f "$CLAUDE_JSON" ] && [ ! -L "$CLAUDE_JSON" ]; then cp "$CLAUDE_JSON" "$CLAUDE_JSON_PERSISTED"; fi; fi; ` +
    `rm -f "$CLAUDE_JSON"; ln -s "$CLAUDE_JSON_PERSISTED" "$CLAUDE_JSON"`
  );
}

/** Edit `dir`'s devcontainer.json to run persistenceFixScript at container creation, ahead of
 *  whatever `postCreateCommand` already does — through jsonc-parser's modify/applyEdits, which
 *  rewrites only that one field's value and leaves every comment and the rest of the file's
 *  formatting exactly as it was (a plain parse-and-stringify round trip would strip both). */
export function applyClaudeJsonPersistenceFix(dir: string): { ok: boolean; message: string } {
  const gap = detectClaudeJsonPersistenceGap(dir);
  if (!gap) return { ok: false, message: "No persistence gap detected here — nothing to fix." };
  const raw = readFileSync(gap.configPath, "utf8");
  const config: unknown = parseJsonc(raw);
  const existing = isRecord(config) ? config.postCreateCommand : undefined;
  if (existing !== undefined && typeof existing !== "string") {
    // The array/object forms (parallel named commands) are real but rarer, and guessing at how to
    // fold a new command into one would risk breaking whatever ordering the author relied on.
    return { ok: false, message: "postCreateCommand is not a plain string in this file — add the fix to it by hand." };
  }
  const script = persistenceFixScript(gap.claudeJsonTarget, gap.claudeDirTarget);
  const newValue = existing ? `${script} && ${existing}` : script;
  const edits = modify(raw, ["postCreateCommand"], newValue, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" } });
  writeFileSync(gap.configPath, applyEdits(raw, edits), "utf8");
  return { ok: true, message: "postCreateCommand updated. Rebuild the container to pick it up." };
}

// The `devcontainer.json` edit alone only takes effect on the NEXT rebuild — this is the other
// half, applying the same script inside whatever container is running RIGHT NOW so the fix (and
// the conversation history it recovers) doesn't wait for one.
export function applyClaudeJsonPersistenceFixLive(dir: string, gap: ClaudePersistenceGap): Promise<{ ok: boolean; output: string }> {
  const script = persistenceFixScript(gap.claudeJsonTarget, gap.claudeDirTarget);
  return new Promise((resolve) => {
    // `sh`, not `bash`: postCreateCommand's own string form runs under `/bin/sh` per the
    // devcontainer spec, and a minimal image (measured: plain alpine) may have no bash at all —
    // this script is plain POSIX test/if/command-substitution, so sh is both the more portable
    // choice and the one that actually matches what the file half of this fix will run as.
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- 'devcontainer' is a standard tool from PATH, same convention as devcontainer-flag.ts
    const child = spawn("devcontainer", ["exec", "--workspace-folder", dir, "sh", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", (err) => resolve({ ok: false, output: String(err) }));
    child.on("close", (code) => resolve({ ok: code === 0, output: Buffer.concat(chunks).toString("utf8") }));
  });
}

/** Whether there is a container currently running to apply the live half of the fix to — the
 *  file edit above always succeeds on its own; this just tells the caller whether to also expect
 *  (and wait for) applyClaudeJsonPersistenceFixLive doing something real. */
export const hasRunningContainer = (dir: string): Promise<boolean> => runningDevcontainerName(dir).then((name) => name !== null);
