// Starting a grok session in a PTY.
//
// The shortest of the four spawners, and deliberately so: grok takes `--session-id <UUID>` for a
// new conversation, so the id is the one THIS server minted. There is nothing to watch for, nothing
// to claim, and no session->conversation map to keep — the whole apparatus codex and antigravity
// need (a watcher, a `claimed…` set, `remember…`) exists only because those two mint their own ids
// and tell nobody. grok is claude-shaped on this axis; see server/agents/grok-args.ts.
//
// It is antigravity-shaped on the OTHER axis: grok reads its MCP servers from a file in the
// directory rather than from a flag, so that file is brought in line on the way past.
import type { WebSocket } from "ws";
import { PORT } from "../config/env.js";
import type { ToolGroup } from "../../common/toolGroups.js";
import { guiMcpEnv } from "./mcp-config.js";
import { grokAdapter } from "../agents/grok.js";
import { buildGrokArgs } from "../agents/grok-args.js";
import { syncGrokMcpConfig } from "../agents/grok-mcp.js";
import { ptySpawn } from "./pty-spawn.js";
import { wireAgentPtyRelay } from "./pty-relay.js";
import { ptyStartLine } from "./pty-exit-log.js";
import { ptys } from "./registry.js";
import type { PtyEntry } from "./types.js";
import type { SpawnDeps } from "./spawn-deps.js";

export function createGrokSpawner(deps: SpawnDeps) {
  function spawnGrokPty(
    sessionId: string,
    ws: WebSocket | null,
    resumeConversationId: string | null,
    cwd: string,
    options: {
      /** The tool groups this cell's DIRECTORY has registered, read by the caller (the lookup reads
       *  Claude Code's config files, and this is sync).
       *
       *  REQUIRED, and deliberately not defaulted, for the reason antigravity's is: the file is
       *  shared by every session in the directory, so a caller that had not looked the groups up
       *  would not merely spawn without GUI tools — it would DEREGISTER the ones every other
       *  session there is using. */
      mcpGroups: readonly ToolGroup[];
      /** Run this as the session's first turn (a collection action, a background chat). */
      initialPrompt?: string | null;
    },
  ): PtyEntry {
    const { mcpGroups, initialPrompt = null } = options;
    syncGrokMcpConfig(cwd, mcpGroups);

    const args = buildGrokArgs({ sessionId, resume: resumeConversationId, model: deps.grokModel, skipPermissions: true, initialPrompt });
    // The session id reaches the GUI MCP bridge through this environment and nowhere else — the
    // config file grok reads is shared by every session in the directory (see grok-mcp.ts).
    const { term, tmux, reattached } = ptySpawn(sessionId, deps.grokBin, args, cwd, true, {
      env: guiMcpEnv(sessionId, PORT),
      binEnvVar: grokAdapter.binEnvVar,
    });
    const spawnedAtMs = Date.now();
    const note = resumeConversationId ? `resume ${resumeConversationId}` : null;
    console.log(ptyStartLine({ agent: "grok", pid: term.pid, cwd, tmux, reattached, sessionId, note }));

    const entry: PtyEntry = { term, ws, buffer: "", cwd, tmux, active: false, agent: "grok" };
    ptys.set(sessionId, entry);

    wireAgentPtyRelay(entry, sessionId, spawnedAtMs, deps);
    return entry;
  }

  return { spawnGrokPty };
}
