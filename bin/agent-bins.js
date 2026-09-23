// Which binary each hosted agent runs, and the environment variable that overrides it.
//
// Here in `bin/` rather than in `server/` because the CLI needs it BEFORE the server exists: the
// start-up gate has to decide whether the declared agent is installed, and it runs under plain node
// with no tsx. The server imports from `bin/` already (bin/instances.js), so this direction is the
// established one.
//
// The table is duplicated knowledge by construction — `server/config/agent-bins.ts` builds the same
// mapping out of the adapters — so a spec pins the two together rather than a comment asking the
// next person to keep them in sync.
//
// The KEY is the agent id and the `bin` is NOT always the same word: agy and cursor-agent are the
// commands, `antigravity` and `cursor` are what the rest of the app calls them.
export const AGENT_BIN_SPEC = {
  claude: { env: "CLAUDE_BIN", bin: "claude" },
  codex: { env: "CODEX_BIN", bin: "codex" },
  antigravity: { env: "ANTIGRAVITY_BIN", bin: "agy" },
  grok: { env: "GROK_BIN", bin: "grok" },
  muse: { env: "MUSE_BIN", bin: "muse" },
  copilot: { env: "COPILOT_BIN", bin: "copilot" },
  cursor: { env: "CURSOR_BIN", bin: "cursor-agent" },
};

/** The command that actually runs for `agent`, honouring its `<AGENT>_BIN` override. */
export function agentBin(agent, env = process.env) {
  const spec = AGENT_BIN_SPEC[agent];
  if (spec === undefined) return null;
  return env[spec.env] || spec.bin;
}

/** The install command for the agents this repository actually documents one for — Claude Code in
 *  the start-up gate's own message, codex in PATH_TOOLS. The other five are deliberately ABSENT
 *  rather than guessed: an install line that is wrong is worse than none, because it is the one
 *  thing a stuck user will paste. They get the binary name and the guide link instead. */
export const AGENT_INSTALL_HINT = {
  claude: "npm install -g @anthropic-ai/claude-code  &&  claude auth login",
  codex: "npm install -g @openai/codex",
};
