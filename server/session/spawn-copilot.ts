// Starting a GitHub Copilot CLI session in a PTY.
//
// The simplest first-class spawner here, because copilot collapses the two things that make the
// others long:
//
//   ONE FLAG FOR NEW AND RESUME. `--session-id <uuid>` both mints and resumes (copilot-args.ts), so
//   there is no watcher, no `claimed…` set, no conversation map and no resume branch. Even grok —
//   the previous shortest — needs two mutually exclusive flags.
//
//   HOOKS, NOT A TAIL. copilot reports its own turns the way claude does, so none of the rollout
//   tailing codex needs exists here. What is different from claude is WHERE the hooks are
//   registered: machine-globally, once, rather than per spawn — see copilot-hooks-file.ts for the
//   measurements behind that, and for why `COPILOT_HOME` must not be used to scope it.
import type { WebSocket } from "ws";
import { PORT } from "../config/env.js";
import { buildCopilotArgs } from "../agents/copilot-args.js";
import { copilotAdapter } from "../agents/copilot.js";
import { copilotMcpConfigJson } from "../agents/copilot-mcp.js";
import { copilotHome, syncCopilotHooksFile } from "../agents/copilot-hooks-file.js";
import type { ToolGroup } from "../../common/toolGroups.js";
import { codexGuiMcpServers } from "./mcp-config.js";
import { claimFullGuiMcp, ptys } from "./registry.js";
import { ptySpawn, ptyWouldReattach } from "./pty-spawn.js";
import { ptyStartLine } from "./pty-exit-log.js";
import { wireAgentPtyRelay } from "./pty-relay.js";
import { seedPromptArgument, withSettingsCleanup } from "./session-settings.js";
import type { PtyEntry } from "./types.js";
import type { SpawnDeps } from "./spawn-deps.js";

export function createCopilotSpawner(deps: SpawnDeps) {
  function spawnCopilotPty(
    sessionId: string,
    ws: WebSocket | null,
    // Positional for symmetry with the other spawners, and unused: `--session-id` resumes the same
    // id it creates, so a resume needs nothing the fresh path does not already pass.
    _resumeId: string | null,
    cwd: string,
    attachGuiMcp: boolean,
    options: { initialPrompt?: string | null; mcpGroups?: readonly ToolGroup[] } = {},
  ): PtyEntry {
    const { initialPrompt = null, mcpGroups = [] } = options;
    // Every spawn, not only at boot: the file is one the user can delete, and rewriting it costs a
    // read when it already matches (see syncCopilotHooksFile).
    syncCopilotHooksFile("127.0.0.1", PORT);

    // The same two surfaces codex has: the workspace (or a cell-less chat) carries the whole GUI
    // MCP on one URL, a project cell carries one URL per group its DIRECTORY registered. Copilot
    // can be given either through the same per-spawn flag, so unlike agy/grok/muse there is no
    // file in the directory to keep in step.
    const allTools = claimFullGuiMcp(sessionId, attachGuiMcp, cwd, ptyWouldReattach(sessionId, true), "copilot");
    const mcpConfig = allTools
      ? deps.mcpConfigJson(sessionId, "127.0.0.1")
      : copilotMcpConfigJson(codexGuiMcpServers({ sessionId, port: PORT, groups: mcpGroups, allTools }));

    // A seed this agent takes as an ARGUMENT cannot carry a newline on Windows, so it may travel in
    // a file with the command line naming it instead (#1518, session-settings.ts).
    const seed = initialPrompt === null ? null : seedPromptArgument(sessionId, initialPrompt);
    const args = buildCopilotArgs({ sessionId, model: deps.copilotModel, allowAllTools: true, mcpConfig, initialPrompt: seed });

    // A spawn that throws never reaches reap(), where the seed file is normally cleaned up — the
    // same guarantee spawn-claude takes for its settings file (#579, #1518).
    const { entry, spawnedAtMs } = withSettingsCleanup(sessionId, () => {
      // COPILOT_HOME is set EXPLICITLY, even though this process may already have it: a tmux pane
      // inherits the tmux SERVER's environment, not ours (the same trap hook-settings.ts names for
      // claude's provider block). Without it the agent would resolve a different home than the one
      // syncCopilotHooksFile just wrote into — and since that file is the whole status mechanism,
      // the failure is a cell that runs perfectly and never reports a thing. Measured: it is exactly
      // what happened the first time this was driven end to end.
      const { term, tmux, reattached } = ptySpawn(sessionId, deps.copilotBin, args, cwd, true, {
        binEnvVar: copilotAdapter.binEnvVar,
        env: { COPILOT_HOME: copilotHome() },
      });
      const at = Date.now();
      console.log(ptyStartLine({ agent: "copilot", pid: term.pid, cwd, tmux, reattached, sessionId, note: null }));
      const created: PtyEntry = { term, ws, buffer: "", cwd, tmux, active: false, agent: "copilot" };
      ptys.set(sessionId, created);
      return { entry: created, spawnedAtMs: at };
    });

    wireAgentPtyRelay(entry, sessionId, spawnedAtMs, deps);
    return entry;
  }

  return { spawnCopilotPty };
}
