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
  // Use session-index.db's own timestamp consistently (not a directory mtime derived from 4-char prefix)
  const out: MuseConversationSummary[] = sessions.map((s) => ({
    id: s.id,
    title: s.title || s.id,
    mtime: s.updatedAtUs ? s.updatedAtUs / 1000 : 0,
    model: s.modelId,
  }));
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
