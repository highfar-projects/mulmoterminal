// Pick the effective session id for a claude /ws connection. Its own module rather than
// ws-routes.ts's because it is the one place that gathers the LIVE facts the decision needs.
import { randomUUID } from "node:crypto";
import { tmuxHasSession } from "../infra/tmux.js";
import { ptys } from "./registry.js";
import { sessionExistsOnDisk } from "./session-reads.js";
import { claudeHomeForSession } from "./project-dir.js";
import { clearedClaudeIdOf, clearedTranscripts } from "./cleared-transcripts.js";
import { resolveSession, type SessionResolution } from "./session-resolve.js";

// Reattach a same-process live pty, resume an on-disk transcript, attach a live tmux session,
// else a fresh id. The flag decision lives in resolveSession (pure/tested); this only gathers the
// live facts — lazily, so a live pty short-circuits the tmux + disk probes.
export function resolveClaudeSession(requested: string | null, cwd: string): SessionResolution {
  const hasLivePty = !!requested && ptys.has(requested);
  const tmuxAlive = !hasLivePty && !!requested && tmuxHasSession(requested);
  // Which `~/.claude`-shaped directory THIS session's transcript actually lives under — the
  // host's default, unless it is on record as running on a configured account (project-dir.ts's
  // own comment has the full reasoning: get this wrong and a session on a non-default account can
  // never be resumed at all once no live pty or tmux session survives to skip this check).
  const claudeHome = requested ? claudeHomeForSession(requested) : undefined;
  const onDisk = !hasLivePty && !!requested && sessionExistsOnDisk(requested, cwd, claudeHome);
  // Whether that transcript is the frozen pre-`/clear` one, and where the clear moved the
  // conversation if it is. Both marks are hydrated from disk at boot, so they answer across the
  // restart this decision is usually made after (#2013) — and the successor is only offered once
  // its OWN transcript is on disk, since `--resume` refuses an id it cannot find. Checked under the
  // SAME `claudeHome` as `requested`: a `/clear`'s successor is the same conversation continuing
  // on the same account, whether or not that successor id has earned its own entry in the
  // resume table yet.
  const cleared = !hasLivePty && !!requested && clearedTranscripts.has(requested);
  const successorId = cleared && requested ? (clearedClaudeIdOf(requested) ?? null) : null;
  const clearedSuccessor = successorId && sessionExistsOnDisk(successorId, cwd, claudeHome) ? successorId : null;
  return resolveSession(requested, { hasLivePty, tmuxAlive, onDisk, cleared, clearedSuccessor }, randomUUID);
}
