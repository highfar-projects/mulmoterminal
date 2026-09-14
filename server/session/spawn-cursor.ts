// Starting a Cursor CLI session in a PTY.
//
// As short as copilot's, and for the same two reasons:
//
//   ONE FLAG FOR NEW AND RESUME. `--resume <uuid>` starts a chat under an id we choose and later
//   returns to it, so there is no watcher, no `claimed…` set, no conversation map and no resume
//   branch. Measured against 2026.09.10-fd3934a: a uuid this server invented — never passed to
//   `create-chat` — starts a new chat and comes back as the `conversation_id` on every hook of that
//   session. `create-chat` exists and is not needed.
//
//   HOOKS, NOT A TAIL. cursor reports its own turns the way claude does. Where it differs is WHERE
//   the hooks are registered: machine-globally, once, rather than per spawn — cursor-hooks-file.ts
//   has the measurements, including why the per-spawn `--plugin-dir` cannot be used for this.
//
// NO GUI MCP. Cursor reads MCP servers from a file (`~/.cursor/mcp.json`, or `.cursor/mcp.json` in
// the directory) and has no per-spawn flag, so it is agy/grok-shaped rather than claude-shaped —
// and the directory writer that would put our group servers there is deliberately not part of this
// change: it writes into the user's own repository, which is its own decision with its own
// invariants. A cursor cell therefore reaches whatever MCP the user configured themselves.
import type { WebSocket } from "ws";
import { PORT } from "../config/env.js";
import { buildCursorArgs } from "../agents/cursor-args.js";
import { cursorAdapter } from "../agents/cursor.js";
import { syncCursorHooksFile } from "../agents/cursor-hooks-file.js";
import { ptys } from "./registry.js";
import { ptySpawn } from "./pty-spawn.js";
import { ptyStartLine } from "./pty-exit-log.js";
import { wireAgentPtyRelay } from "./pty-relay.js";
import { seedPromptArgument, withSettingsCleanup } from "./session-settings.js";
import type { PtyEntry } from "./types.js";
import type { SpawnDeps } from "./spawn-deps.js";

export function createCursorSpawner(deps: SpawnDeps) {
  function spawnCursorPty(
    sessionId: string,
    ws: WebSocket | null,
    // Positional for symmetry with the other spawners, and unused: `--resume` returns to the same
    // id it creates, so a resume needs nothing the fresh path does not already pass.
    _resumeId: string | null,
    cwd: string,
    options: { initialPrompt?: string | null } = {},
  ): PtyEntry {
    const { initialPrompt = null } = options;
    // Every spawn, not only at boot: the file is one the user can delete, and rewriting it costs a
    // read when it already matches (see syncCursorHooksFile).
    syncCursorHooksFile(PORT);

    // A seed this agent takes as an ARGUMENT cannot carry a newline on Windows, so it may travel in
    // a file with the command line naming it instead (#1518, session-settings.ts).
    const seed = initialPrompt === null ? null : seedPromptArgument(sessionId, initialPrompt);
    const args = buildCursorArgs({ sessionId, model: deps.cursorModel, initialPrompt: seed });

    // A spawn that throws never reaches reap(), where the seed file is normally cleaned up — the
    // same guarantee spawn-claude takes for its settings file (#579, #1518).
    const { entry, spawnedAtMs } = withSettingsCleanup(sessionId, () => {
      const { term, tmux, reattached } = ptySpawn(sessionId, deps.cursorBin, args, cwd, true, { binEnvVar: cursorAdapter.binEnvVar });
      const at = Date.now();
      console.log(ptyStartLine({ agent: "cursor", pid: term.pid, cwd, tmux, reattached, sessionId, note: null }));
      const created: PtyEntry = { term, ws, buffer: "", cwd, tmux, active: false, agent: "cursor" };
      ptys.set(sessionId, created);
      return { entry: created, spawnedAtMs: at };
    });

    wireAgentPtyRelay(entry, sessionId, spawnedAtMs, deps);
    return entry;
  }

  return { spawnCursorPty };
}
