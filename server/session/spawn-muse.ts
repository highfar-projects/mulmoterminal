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

    // Snapshot before spawn for fresh sessions. The snapshot is async (sqlite)
    // so we start it BEFORE ptySpawn — otherwise the fire-and-forget read can
    // finish after Muse has already written its row and realBefore already
    // contains the new id, causing watchForMuseSession to exclude it forever.
    let beforePromise: Promise<Set<string>> | null = null;
    if (!resumeConversationId) {
      beforePromise = snapshotMuseSessions(cwd);
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
    } else if (beforePromise) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      beforePromise.then((realBefore) => {
        if (!ptys.has(sessionId)) return;
        captureMuseSession(sessionId, cwd, realBefore);
      });
    }

    wireAgentPtyRelay(entry, sessionId, spawnedAtMs, deps);
    return entry;
  };

  return { spawnMusePty };
}
