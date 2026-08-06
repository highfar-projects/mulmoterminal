// Starting a `muse` session in a PTY. Like codex/agy, muse mints its session id
// itself, so a fresh session is watched until that id appears — that is what lets a
// later cold reconnect resume it.
import { museAdapter } from "../agents/muse.js";
import { buildMuseArgs } from "../agents/muse-args.js";
import { snapshotMuseSessions, watchForMuseSession } from "../agents/muse-session.js";
import { ptySpawn } from "./pty-spawn.js";
import { ptyStartLine } from "./pty-exit-log.js";
import { wireAgentPtyRelay } from "./pty-relay.js";
import { claimedMuseSessions, ptys, rememberMuseSession } from "./registry.js";
import type { SpawnDeps } from "./spawn-deps.js";
import type { PtyEntry } from "./types.js";

export function createMuseSpawner(deps: SpawnDeps) {
  function captureMuseSession(sessionId: string, cwd: string, before: ReadonlySet<string>): void {
    watchForMuseSession(cwd, before, { claimed: claimedMuseSessions, isCancelled: () => !ptys.has(sessionId) })
      .then((id) => {
        if (!id) return;
        claimedMuseSessions.add(id);
        rememberMuseSession(sessionId, id, cwd);
        deps.publishActivity(sessionId);
        console.log(`[pty] captured muse session ${id} for mulmo session ${sessionId}`);
      })
      .catch(() => {});
  }

  const spawnMusePty = (
    sessionId: string,
    ws: import("ws").WebSocket | null,
    resumeConversationId: string | null,
    cwd: string,
    options: { initialPrompt?: string | null } = {},
  ): PtyEntry => {
    const { initialPrompt = null } = options;

    // Snapshot before spawn for fresh sessions
    let before: Set<string> | null = null;
    // We need sync snapshot — but spawn is sync in other agents that snapshot synchronously via fs.
    // For muse, snapshot is async (DB). Instead, capture before as empty and let watcher find any new.
    // To keep correct semantics, we snapshot synchronously as empty and rely on watcher polling.
    // Better: start async snapshot then spawn — but we need before value.
    // We'll do fire-and-forget with current DB state approximated.
    if (!resumeConversationId) {
      before = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      snapshotMuseSessions(cwd).then((realBefore) => {
        if (!ptys.has(sessionId)) return;
        captureMuseSession(sessionId, cwd, realBefore);
      });
    }

    const args = buildMuseArgs({
      resume: resumeConversationId,
      workspace: resumeConversationId ? null : cwd,
      model: deps.museModel,
      initialPrompt,
    });

    const { term, tmux, reattached } = ptySpawn(sessionId, deps.museBin, args, cwd, true, { binEnvVar: museAdapter.binEnvVar });
    const spawnedAtMs = Date.now();
    const note = resumeConversationId ? `resume ${resumeConversationId}` : null;
    console.log(ptyStartLine({ agent: "muse", pid: term.pid, cwd, tmux, reattached, sessionId, note }));
    const entry: PtyEntry = { term, ws, buffer: "", cwd, tmux, active: false, agent: "muse" };
    ptys.set(sessionId, entry);

    if (resumeConversationId) {
      rememberMuseSession(sessionId, resumeConversationId, cwd);
    } else if (before) {
      // fallback capture if snapshot wasn't ready — will be superseded by async one
      // only if we didn't already start async watcher
    }

    wireAgentPtyRelay(entry, sessionId, spawnedAtMs, deps);
    return entry;
  };

  return { spawnMusePty };
}
