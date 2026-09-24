# refactor: one table for every agent's config home (#2222)

Groundwork for #2215 (a cell per subscription). There, the directory an agent keeps its logins,
transcripts and skills in becomes a per-cell value. Today each agent's home is built in its own
file, and claude's `~/.claude` is spelled out at every reader — so a reader left behind would not
fail, it would just see no sessions.

## Change (behaviour-preserving)

- `server/agents/agent-homes.ts`: `AGENT_HOMES: Record<TerminalAgent, { envVar, defaultSegments }>`,
  plus `agentHome(agent)` (the variable if set, else the default) and `agentDefaultHome(agent)`
  (the default, ignoring the variable). A new agent without a row is a type error.
- Every existing home function delegates to it and keeps its exported name: `codexSessionsRoot`,
  `codexSkillsRoot`, `grokHome`, `antigravityHome`, `copilotHome`, `cursorHome`, `museHome`.
- claude gets `claudeProjectsRoot()` and `claudeUserSkillsDir()` beside `projectSessionsDir()` and
  `claudeHistoryFile()` in `server/session/project-dir.ts`, all taking the home as a defaulted
  parameter — the entry point #2215 will pass a cell's home through. `session-reads.ts`,
  `cli-init.ts`, `collections.ts` and `install-bundled-skills.ts` stop building `~/.claude` by hand.

## Deliberately unchanged

- claude's row has `envVar: null`: nothing but the `.claude.json` lookup reads `CLAUDE_CONFIG_DIR`
  today, and making the rest read it is a behaviour change.
- `codexSessionsDir()` (codex-rollout.ts) still ignores `CODEX_HOME`, via `agentDefaultHome`.
- `.claude.json` in `gui-mcp-registration.ts` stays where it is — it follows a different rule
  (`CLAUDE_CONFIG_DIR || ~`, not `~/.claude`) and belongs next to claude's row once that row
  honours the variable.

Those three are the follow-up PR. Project-scope `<root>/.claude/` paths are out of scope entirely.

## Verification

Old and new home expressions run side by side over generated environments (each variable unset,
empty, set; `HOME` varied), whole results compared. Then `yarn format`, `lint`, `build`,
`typecheck`, `test`.
