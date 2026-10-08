// Builds the argv for spawning GitHub Copilot CLI as a first-class session.
//
// The shortest builder here, because copilot collapses two axes other agents split:
//
// ONE FLAG FOR BOTH NEW AND RESUME. `--session-id <uuid>` is documented as "Resume an existing
// session or task by ID, or set the UUID for a new session", and both halves were measured against
// copilot 1.0.83: passing a fresh uuid created `~/.copilot/session-state/<that uuid>/`, and passing
// it again on a later run answered a question about the earlier turn. So there is no resume branch
// to get wrong, and — like claude and grok, unlike codex, agy and muse — the id is OURS, so no
// watcher, no attribution guess and no conversation map exist for this agent.
//
// `--resume=<id>` is NOT that flag: it is the interactive picker, and combining it with a prompt
// fails with a usage hint pointing at `--session-id`. Do not "fix" this by switching to it.
//
// A SEED IS `-i`, NOT `-p`. `-p/--prompt` runs the prompt and EXITS, which is the opposite of what
// a grid cell wants; `-i/--interactive <prompt>` starts the TUI and runs the prompt in it.

export interface CopilotArgsInput {
  /** The session key this server minted. Starts a new session, or resumes that same session. */
  sessionId: string;
  /** Model override (--model), or null to use copilot's own configured default. */
  model?: string | null;
  /** Auto-approve tool use, the counterpart of claude's `--permission-mode auto`. A grid cell has
   *  no way to answer a modal approval prompt in a TUI nobody is watching. */
  allowAllTools?: boolean;
  /** The GUI MCP payload (`mcpConfigJson`), or null for a session that carries none. Copilot takes
   *  the same `{"mcpServers":{…}}` shape claude does, as a JSON string or an `@file`. */
  mcpConfig?: string | null;
  /** A first turn to run on startup, for a session spawned to DO something (a collection action, a
   *  background chat). Interactive afterwards — see the header on why this is `-i`. */
  initialPrompt?: string | null;
}

export function buildCopilotArgs(input: CopilotArgsInput): string[] {
  const args: string[] = ["--session-id", input.sessionId];

  if (input.model) args.push("--model", input.model);
  if (input.allowAllTools) args.push("--allow-all-tools");
  if (input.mcpConfig) args.push("--additional-mcp-config", input.mcpConfig);
  if (input.initialPrompt) args.push("--interactive", input.initialPrompt);

  return args;
}
