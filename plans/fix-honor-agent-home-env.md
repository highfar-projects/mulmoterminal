# fix: follow CLAUDE_CONFIG_DIR and CODEX_HOME everywhere they are read (#2224)

Follow-up to #2222, which gathered every agent's home into `server/agents/agent-homes.ts` without
changing what it resolves to. Two readers still look somewhere the agent does not write.

## Ground truth

From the Claude Code 2.1.281 bundle: the config home is `CLAUDE_CONFIG_DIR ?? ~/.claude`, and
`projects/`, `history.jsonl` and `skills/` live under it. `.claude.json` is
`(CLAUDE_CONFIG_DIR || ~)/.claude.json`, so its directory is not the config home.

## Change

- claude's row in `AGENT_HOMES` gets `envVar: "CLAUDE_CONFIG_DIR"`. Everything built from
  `agentHome("claude")` — transcripts, history, the user skills root — follows it.
- `.claude.json` moves from `gui-mcp-registration.ts` to `claudeUserConfigFile()` in
  `server/session/project-dir.ts`, beside the other claude paths, and stops trimming the variable
  (Claude does not trim it).
- `codexSessionsDir()` is deleted, and the rate-limit reader uses `codexSessionsRoot()`, which
  already follows `CODEX_HOME`.
- Bundled skills are installed into the claude home's `skills/` AND `~/.claude/skills` when those
  differ. agy is pointed at `~/.claude/skills` literally (`antigravity-skills.ts`), and grok and muse
  index Claude's default roots themselves, so installing only under `CLAUDE_CONFIG_DIR` would take
  the bundled skills away from them.

## Known divergence, accepted

- An EMPTY `CLAUDE_CONFIG_DIR` is treated as unset here. Claude uses `??`, so it would take `""`
  as its home, which resolves against the working directory. This is not worth copying.
- A RELATIVE `CLAUDE_CONFIG_DIR` resolves against this server's cwd. Claude resolves it per process
  cwd, i.e. a different home (and login) per directory, which no working setup has.
- A tmux server started under a different environment hands its panes that environment, so the
  claude inside a cell can still disagree with this process. That is the same gap `CODEX_HOME`
  already has, and it belongs to #2215, where the home becomes per cell.

## Verification

Specs for each row and for the install roots; mutation-check them. `yarn format`, `lint`, `build`,
`typecheck`, `test`. Then boot the server with `CLAUDE_CONFIG_DIR` pointed at a scratch home and
confirm the session list reads from it.
