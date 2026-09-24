# feat: issue start accepts an agent, on the desktop and the phone (#2228)

Groundwork for #2226. No UI change: nothing sends an agent yet, and an absent one is `claude`,
which is exactly today's behaviour.

## Decisions (settled with the user before implementation)

- **GUI tools: the same as a cell opened in that worktree.** An issue session is a project cell, not
  a GUI-started chat, so it gets the directory's registered tool groups (`attachGuiMcp: false`, the
  way Claude's issue sessions already start). That rules out reusing `spawnSeededSession` as it is:
  it gives every seeded chat the full GUI toolset. `spawnModeFor` is reused for the draft-or-run rule.
- **Built-in agents only** (`TERMINAL_AGENTS`). Custom agents wait for #2226, after #2215 changes
  what a launch chooses (agent plus account).
- **The seed is unchanged.** Every agent but Claude runs it at once; it already ends by asking for
  the approach to be confirmed before implementing.

## Change

- `server/session/issue-session-spawn.ts` (new):
  - `requestedIssueAgent(raw)`: an absent value means `claude`, a known agent is itself, and
    anything else is `null` (refused).
  - `createIssueSessionSpawner(deps)`: `(agent, cwd, seed, run) => Promise<IssueSession>`, one entry
    per agent in a `Record<TerminalAgent, …>`, so a new agent is a type error here.
    - Claude: `issueSpawnOptions` as before.
    - codex / copilot: `attachGuiMcp: false` plus the directory's groups.
    - cursor: the groups, synced and approved first (`syncDirectoryMcpForSpawnAsync`), as its cell does.
    - antigravity / grok / muse: the groups.
    - Every agent but Claude gets the seed as `initialPrompt`.
  - It returns `seedRuns`, from `spawnModeFor`.
- `server/git/issue-work.ts`: `spawnDraft` becomes `spawnSeeded`, async, since the group lookup is.
- `server/routes/issue-work-routes.ts`: reads `agent` from the body (400 when it names no agent) and
  spawns through the new spawner.
- The phone (`handlers/issueWork.ts`, `hostBindings.ts`): the `startIssueWork` command takes an
  optional `agent`. `ran` now reports the seed actually running, which is true for every agent but a
  Claude draft. The unplaced mark now carries the agent, so the grid that adopts the session attaches
  it on the right endpoint.
- The spawner is built once in `index.ts` and handed to both routes.

## Tests

- `issue-session-spawn.spec.ts`: each agent reaches its own spawner with the cell's options; cursor
  syncs before it spawns; `seedRuns` for every agent × run; `requestedIssueAgent` both ways.
- Route: `agent` passes through, is `claude` when absent, and is a 400 when unknown.
- Phone: `agent` passes through, an unknown one is refused, `ran` for a non-Claude agent, and the
  unplaced mark's agent.
