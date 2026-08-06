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

    // No GUI MCP is attached, and that is an ANSWER rather than an omission: muse has no
    // `--mcp-config`, no `-c key=value` and no MCP of its own at all, so there is nothing to hand
    // it and nothing in the directory for it to read. The answer is declared in
    // common/guiMcpAgents.ts, which is what `carriesFullGuiMcp` consults and what the launcher
    // form reads — so it is one fact both sides see, and a spec pins it (test/server/session/
    // muse-gui-mcp.spec.ts) rather than a call here discarding its own result.

    // Snapshot before spawn for fresh sessions. The snapshot is async (sqlite)
    // so we start it BEFORE ptySpawn — otherwise the fire-and-forget read can
    // finish after Muse has already written its row and realBefore already
    // contains the new id, causing watchForMuseSession to exclude it forever.
    // We start the snapshot before ptySpawn to bound the race; awaiting it
    // before spawn would require making this spawner async and changing all
    // callers (ws-routes, plugin-routes, index) to await — a heavy lift that
    // trades a rare first-launch cold-resume miss for a sync-vs-async split
    // across the spawner surface. The `starts-before` ordering keeps the window
    // to ~the SQLite read itself (ms) vs. Muse's row write (100ms+).
    let beforePromise: Promise<Set<string>> | null = null;
    if (!resumeConversationId) {
      beforePromise = snapshotMuseSessions(cwd).catch(() => new Set<string>());
    }

    // The workspace is passed on BOTH paths — a resumed session that loses `--workspace` comes
    // back without the tools it was working with (see muse-args.ts).
    const args = buildMuseArgs({ resume: resumeConversationId, workspace: cwd, model: deps.museModel, initialPrompt });

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
