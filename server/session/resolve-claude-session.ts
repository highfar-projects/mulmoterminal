// Pick the effective session id for a claude /ws connection. Its own module rather than
// ws-routes.ts's because it is the one place that gathers the LIVE facts the decision needs.
import { randomUUID } from "node:crypto";
import { tmuxHasSession } from "../infra/process/tmux.js";
import { ptys } from "./registry.js";
import { sessionExistsOnDisk } from "./session-reads.js";
import { clearedClaudeIdOf, clearedTranscripts } from "./transcript/cleared-transcripts.js";
import { resolveSession, type SessionResolution } from "./list/session-resolve.js";

// Reattach a same-process live pty, resume an on-disk transcript, attach a live tmux session,
// else a fresh id. The flag decision lives in resolveSession (pure/tested); this only gathers the
// live facts — lazily, so a live pty short-circuits the tmux + disk probes.
export function resolveClaudeSession(requested: string | null, cwd: string): SessionResolution {
  const hasLivePty = !!requested && ptys.has(requested);
  const tmuxAlive = !hasLivePty && !!requested && tmuxHasSession(requested);
  const onDisk = !hasLivePty && !!requested && sessionExistsOnDisk(requested, cwd);
  // Whether that transcript is the frozen one a `/clear` or an in-cell `/resume` left, and where the
  // conversation went if it is (#3325). Both marks are hydrated from disk at boot, so they answer across the
  // restart this decision is usually made after (#2013) — and the successor is only offered once
  // its OWN transcript is on disk, since `--resume` refuses an id it cannot find. Both reads look in
  // the session's own home (session-home.ts), so a second login's transcripts are found too.
  const cleared = !hasLivePty && !!requested && clearedTranscripts.has(requested);
  const successor = cleared && requested ? clearedClaudeIdOf(requested) : undefined;
  const successorOnDisk = successor && sessionExistsOnDisk(successor, cwd) ? successor : null;
  return resolveSession(requested, { hasLivePty, tmuxAlive, onDisk, cleared, successorOnDisk }, randomUUID);
}
