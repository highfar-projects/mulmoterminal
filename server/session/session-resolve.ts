// Pure decision for how a /ws connection should (re)connect a requested session id.
// Split out from index.ts so the flag choice — the one that decides `--resume` vs
// `--session-id` — is unit-testable without a pty, tmux, or the filesystem.

export interface SessionFacts {
  // A live pty for this id in THIS server process (reattach without respawning claude).
  hasLivePty: boolean;
  // A persistent tmux session for this id is alive (survived a restart / another cell).
  tmuxAlive: boolean;
  // An on-disk transcript exists in the target workspace (claude writes it after the
  // first prompt) — the only id claude will `--resume`.
  onDisk: boolean;
}

export interface SessionResolution {
  reattachId: string | null; // reattach this same-process pty (no new claude)
  resume: string | null; // `--resume` this on-disk transcript
  sessionId: string; // the id claude effectively runs as
}

// `resume` is set whenever a transcript exists on disk — REGARDLESS of tmux liveness.
// An on-disk id must never be launched under `--session-id`: claude refuses it with
// "Session ID <id> is already in use." When a tmux session is alive the arg is ignored
// (tmux attaches to the running claude), but if that session died since we checked it
// (reap, /exit, or another instance on the shared tmux server), `tmux new-session -A`
// re-creates it and RUNS the command — and there `--resume <id>` reattaches the
// conversation where `--session-id <id>` would abort. Gating `resume` on `!tmuxAlive`
// (the old behavior) left that window fatal.
export function resolveSession(requested: string | null, facts: SessionFacts, mintId: () => string): SessionResolution {
  const reattachId = requested && facts.hasLivePty ? requested : null;
  const resume = !reattachId && requested && facts.onDisk ? requested : null;
  // Reuse the requested id when we can actually serve it (reattach, a live tmux
  // session, or an on-disk transcript to resume); otherwise it can't be reused —
  // mint a fresh one.
  const sessionId = reattachId ?? (requested && (facts.tmuxAlive || resume) ? requested : mintId());
  return { reattachId, resume, sessionId };
}

/**
 * Which id `--resume` actually names, once resolveSession has already decided this connection
 * resumes an on-disk transcript (its `resume`, not `sessionId`). Pulled out because it needs its
 * own I/O-based fact — whether a CLEARED id has a transcript of its own — that resolveSession has
 * no reason to gather when nothing was ever cleared.
 *
 * A `/clear`ed session moves its live conversation to a NEW id that claude mints for itself
 * (cleared-transcripts.ts), while ours stays frozen on the conversation that just ended. Resuming
 * under our own id — the only thing this app used to ever pass to `--resume` — reopens that ended
 * conversation instead of the one still going. This never bites a tmux/live-pty reattach (the
 * running process just carries on past its own `/clear`, no `--resume` involved); it only matters
 * once the process itself is gone and disk is the only way back — every reconnect on a platform
 * with no tmux to keep it alive (Windows), or any reconnect after this server itself restarted.
 *
 * `claudeIdOnDisk` guards a stale or incomplete mark: an id remembered from a clear that never
 * actually flushed a transcript, or whose file is gone since, must not be handed to `--resume`,
 * which refuses an id it cannot find. Falling back to OUR id — whose transcript resolveSession has
 * already confirmed exists, or this would never have set `resume` at all — is always safe.
 */
export function resumeTranscriptId(ownId: string, clearedClaudeId: string | null, claudeIdOnDisk: boolean): string {
  return clearedClaudeId && clearedClaudeId !== ownId && claudeIdOnDisk ? clearedClaudeId : ownId;
}

// ── the same decision for the two non-claude terminals ─────────────────────────

/** Which id a launcher or codex connection runs as. A live pty in this process always
 *  wins; otherwise the requested id is reused only when something can actually serve it
 *  (a surviving tmux session, or — for codex — a rollout to resume). Anything else mints
 *  a fresh id, because reusing an id nothing can serve strands the client on a dead one. */
export function resolveReattachableId(
  requested: string | null,
  facts: { hasLivePty: boolean; tmuxAlive: boolean; canResume: boolean },
  mintId: () => string,
): { reattachId: string | null; sessionId: string } {
  const reattachId = requested && facts.hasLivePty ? requested : null;
  const sessionId = reattachId ?? (requested && (facts.tmuxAlive || facts.canResume) ? requested : mintId());
  return { reattachId, sessionId };
}

/**
 * Whether a connection CONTINUES a session rather than creating one.
 *
 * Both resolvers above keep the requested id exactly when something can serve it — a live pty, a
 * surviving tmux session, a transcript or rollout to resume — and mint a fresh one otherwise. So
 * the id they settled on already answers this, and reading it here is what stops a caller from
 * re-listing those cases and missing one: the first version of the worktree limit did exactly
 * that, omitting tmux-only liveness, which reads a reconnect after a server restart as a brand-new
 * session (#1208, caught by Codex).
 */
export const isContinuingSession = (requested: string | null, sessionId: string): boolean => requested !== null && requested === sessionId;

/** Whether a launcher connection may start at all. A reattach needs no launcher index —
 *  the pty already IS the chosen program — and the header's "new terminal" button runs the
 *  default shell with no configured index. Otherwise the index must name a real launcher,
 *  or there is nothing to run. */
export function canStartLauncher(facts: { hasLivePty: boolean; tmuxAlive: boolean; hasLauncher: boolean; isShell: boolean }): boolean {
  return facts.hasLivePty || facts.tmuxAlive || facts.hasLauncher || facts.isShell;
}
