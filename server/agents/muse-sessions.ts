import path from "node:path";
import { promises as fs } from "node:fs";
import { museHome } from "./muse-session.js";

export interface MuseConversationSummary {
  id: string;
  title: string;
  mtime: number;
  model?: string | null;
}

export async function listMuseConversations(cwd: string): Promise<MuseConversationSummary[]> {
  // Muse stores sessions in sqlite; use that via muse-session.ts but also expose for /api/muse/sessions
  const { listMuseSessionsForCwd } = await import("./muse-session.js");
  const sessions = await listMuseSessionsForCwd(cwd);
  const out: MuseConversationSummary[] = [];
  for (const s of sessions) {
    let mtime: number;
    try {
      const stat = await fs.stat(path.join(museHome(), "sessions", s.id.slice(0, 4) /* not reliable */));
      mtime = stat.mtimeMs;
    } catch {
      mtime = s.updatedAtUs ? s.updatedAtUs / 1000 : 0;
    }
    out.push({ id: s.id, title: s.title || s.id, mtime, model: s.modelId });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
