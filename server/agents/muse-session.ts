/* eslint-disable @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unused-vars, sonarjs/cognitive-complexity, max-lines-per-function, complexity, @typescript-eslint/no-non-null-assertion, sonarjs/no-nested-conditional */
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { isRecord } from "../../common/isRecord.js";

// Where `muse` keeps sessions: ~/.local/share/muse/sessions + session-index.db
export const museHome = (): string => path.join(os.homedir(), ".local", "share", "muse");
export const museSessionIndexPath = (): string => path.join(museHome(), "session-index.db");
export const museSessionsRoot = (): string => path.join(museHome(), "sessions");

export interface MuseSessionMeta {
  id: string;
  workspaceRoot: string | null;
  modelId: string | null;
  title: string;
  updatedAtUs: number | null;
}

async function readMuseIndexDb(): Promise<MuseSessionMeta[]> {
  const dbPath = museSessionIndexPath();
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare("SELECT session_id, workspace_root, model_id, title, updated_at_us FROM sessions").all() as unknown as Record<string, unknown>[];
      return rows
        .filter((r) => typeof r.session_id === "string")
        .map((r) => ({
          id: String(r.session_id),
          workspaceRoot: typeof r.workspace_root === "string" ? String(r.workspace_root) : null,
          modelId: typeof r.model_id === "string" && String(r.model_id).trim() ? String(r.model_id) : null,
          title: typeof r.title === "string" ? String(r.title) : String(r.session_id),
          updatedAtUs: typeof r.updated_at_us === "number" ? Number(r.updated_at_us) : null,
        }));
    } finally {
      try {
        db.close();
      } catch {
        // ignore close failure
      }
    }
  } catch {
    return [];
  }
}

export async function listMuseSessionsForCwd(cwd: string): Promise<MuseSessionMeta[]> {
  const all = await readMuseIndexDb();
  return all.filter((s) => s.workspaceRoot === cwd);
}

export async function museSessionExists(id: string): Promise<boolean> {
  const all = await readMuseIndexDb();
  return all.some((s) => s.id === id);
}

export async function museSessionExistsForCwd(id: string, cwd: string): Promise<boolean> {
  const all = await readMuseIndexDb();
  return all.some((s) => s.id === id && s.workspaceRoot === cwd);
}

export function museSessionExistsSync(id: string, _workspaceRoot: string | null): Promise<boolean> {
  return museSessionExists(id).then((exists) => exists);
}

// Snapshot for watcher: set of session_ids for a workspace
export async function snapshotMuseSessions(cwd: string): Promise<Set<string>> {
  const sessions = await listMuseSessionsForCwd(cwd);
  return new Set(sessions.map((s) => s.id));
}

export async function watchForMuseSession(
  cwd: string,
  before: ReadonlySet<string>,
  opts: { claimed: ReadonlySet<string>; isCancelled: () => boolean },
  timeoutMs = 15000,
  intervalMs = 500,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (opts.isCancelled()) return null;
    const current = await snapshotMuseSessions(cwd);
    for (const id of current) {
      if (!before.has(id) && !opts.claimed.has(id)) {
        // Found a new session for this workspace
        return id;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export async function museModelFromSessionLog(sessionId: string): Promise<string | null> {
  const dbPath = museSessionIndexPath();
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const row = db.prepare("SELECT model_id FROM sessions WHERE session_id = ?").get(sessionId) as unknown as Record<string, unknown> | undefined;
      if (row && typeof row.model_id === "string" && row.model_id.trim()) return String(row.model_id);
    } finally {
      try {
        db.close();
      } catch {
        // ignore close failure
      }
    }
  } catch {
    // ignore db missing
  }
  return null;
}

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity, complexity
// Read token usage + context from session.jsonl
export async function museBadgesFromLog(
  _cwd: string,
  sessionId: string,
): Promise<{ model: string | null; contextTokens: number; usage: import("../session/transcript.js").SessionUsage } | null> {
  let logPath: string | null = null;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(museSessionIndexPath(), { readOnly: true });
    try {
      const row = db.prepare("SELECT session_log_path FROM sessions WHERE session_id = ?").get(sessionId) as unknown as Record<string, unknown> | undefined;
      if (row && typeof row.session_log_path === "string") logPath = String(row.session_log_path);
    } finally {
      try {
        db.close();
      } catch {
        // ignore close failure
      }
    }
  } catch {
    // ignore db missing
  }
  if (!logPath) return null;
  try {
    const text = await fs.readFile(logPath, "utf8");
    let lastModel: string | null = null;
    let lastContext = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalInputFresh = 0;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let rec: unknown;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isRecord(rec)) continue;
      const payload = isRecord(rec.payload) ? (rec.payload as unknown as Record<string, unknown>) : undefined;
      const event = payload && isRecord(payload.event) ? (payload.event as unknown as Record<string, unknown>) : null;
      if (!event || event.kind !== "model_completed") continue;
      const usage = isRecord(event.usage) ? event.usage : null;
      if (usage && typeof event.model === "string") lastModel = event.model;
      if (usage) {
        const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
        let cached = 0;
        if (typeof usage.cached_tokens === "number") cached = usage.cached_tokens;
        else if (typeof usage.cache_read_tokens === "number") cached = usage.cache_read_tokens;
        const out = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
        if (Number.isFinite(input) && input > lastContext) lastContext = input;
        if (Number.isFinite(out)) totalOutput += out;
        if (Number.isFinite(cached)) totalCacheRead += Math.min(cached, input);
        if (Number.isFinite(input) && Number.isFinite(cached)) totalInputFresh += Math.max(0, input - Math.min(cached, input));
      }
    }
    // For usage badge: inputTokens as lastContext fresh portion? Use totalInputFresh for now, but if we sum fresh each turn double counts.
    // Simpler: use lastContext as contextTokens and totalOutput as usage. For input badge we use lastContext.
    // We'll return usage with inputTokens = lastContext (so badge shows context), but that double counts if summed. Let's use lastContext for inputTokens and cacheRead as totalCacheRead.
    // Actually agent-badges expects usage.inputTokens total. We'll set it to totalInputFresh (sum of fresh) which approximates sum.
    return {
      model: lastModel,
      contextTokens: lastContext,
      usage: { inputTokens: totalInputFresh, outputTokens: totalOutput, cacheReadTokens: totalCacheRead, cacheCreationTokens: 0 },
    };
  } catch {
    return null;
  }
}
