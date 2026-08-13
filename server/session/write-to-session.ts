import { ptys } from "./registry.js";

// Write a chunk to a session's live PTY: the phone's typing (#445), and question answers (#1685).
// Only sessions attached in THIS process are writable: a tmux session that outlived a restart is
// still viewable through capture-pane, but we hold no pty to type into.
//
// Its own module rather than a helper in index.ts, because it now has two callers that reach it
// from different directions — the RemoteHost handlers and an /api route — and index.ts is the file
// this repo keeps splitting apart (#548).
export const writeToSession = (sessionId: string, chunk: string): boolean => {
  const entry = ptys.get(sessionId);
  if (!entry) return false;
  try {
    entry.term.write(chunk);
    return true;
  } catch {
    // pty died between the lookup and the write
    return false;
  }
};
