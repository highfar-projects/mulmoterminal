// Starting a `muse` session in a PTY.
//
// Two shapes at once, which is why this is neither spawn-codex.ts nor spawn-grok.ts:
//
//   codex-shaped on the ID axis — muse mints its own session id and tells nobody, so a fresh
//   session is watched until that id appears, which is what lets a later cold reconnect resume it.
//
//   its OWN shape on the MCP axis — muse reaches the GUI tools through a PLUGIN, and a plugin is
//   installed per MACHINE rather than per directory (server/agents/muse-mcp.ts). So the
//   registration is made once and the DIRECTORY's groups travel on the session's environment
//   instead, where the bridge reads them. `mcpGroups` is therefore used here, not written to a file.
import { museAdapter } from "../agents/muse.js";
import { buildMuseArgs } from "../agents/muse-args.js";
import { snapshotMuseSessions, watchForMuseSession } from "../agents/muse-session.js";
import { syncMuseMcpPlugin } from "../agents/muse-mcp.js";
import { musePluginEnv } from "../agents/muse-mcp.js";
import { rememberEntitledToolGroups } from "./bridge-session.js";
import { ptySpawn, ptyWouldReattach } from "./pty-spawn.js";
import { ptyStartLine } from "./pty-exit-log.js";
import { wireAgentPtyRelay } from "./pty-relay.js";
import { claimedMuseSessions, ptys, rememberMuseSession } from "./registry.js";
import type { SpawnDeps } from "./spawn-deps.js";
import type { PtyEntry } from "./types.js";
import type { SpawnDirectoryMcpPty } from "./spawn-directory-mcp.js";

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

  const spawnMusePty: SpawnDirectoryMcpPty = (sessionId, ws, resumeConversationId, cwd, options) => {
    const { mcpGroups, initialPrompt = null } = options;

    // Registering the plugin is a MACHINE-wide act, so it is done only for a spawn that will really
    // start muse — the same rule syncDirectoryMcpForSpawn states for the two agents with a shared
    // config file, and for the same reason: after a restart this is reached for what turns out to
    // be a tmux REATTACH, and the muse already running there read its plugins at its own start.
    //
    // Not gated on `mcpGroups` being non-empty: the registration is inert without the environment
    // below, and a directory that switches its first group on mid-session would otherwise have to
    // wait for a spawn that happens to have one already.
    if (!ptyWouldReattach(sessionId, true)) syncMuseMcpPlugin();

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

    // The groups are RECORDED, not exported. A plugin's MCP server inherits nothing from muse
    // (server/session/bridge-session.ts), so the bridge asks this server which session it belongs
    // to and gets this list back with the answer. A session whose directory registered nothing
    // records an empty list and every one of the four servers stands down — the same "no GUI
    // tools" a muse cell had before this was wired.
    rememberEntitledToolGroups(sessionId, mcpGroups);
    // What the MUSE process itself needs: it does inherit our environment, and without this flag it
    // loads no plugins at all — the registration would be inert rather than absent.
    const env = musePluginEnv();
    const { term, tmux, reattached } = ptySpawn(sessionId, deps.museBin, args, cwd, true, { env, binEnvVar: museAdapter.binEnvVar });
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
