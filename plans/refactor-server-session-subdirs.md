# refactor: group server/session into subdirectories (#2956)

Fourth of a series after `server/agents` (#2944), `server/config` (#2946) and `server/backends` (#2952):
`session` -> `infra` next, one directory per PR. Same method and constraint: files are moved with
`git mv`, never renamed or edited; only import specifiers and path mentions change.

## Layout

- `spawn/` — how a session is started: the spawner table and its deps, launch choice, failed-spawn
  claims, issue-session spawn, shell and collection spawns, draft injection.
  - `spawn/agents/` — one file per agent CLI (`spawn-claude`, `spawn-codex`, ...), the Claude
    fullscreen switches, and custom-agent command and log.
  - `spawn/setup/` — what a spawn is handed: MCP config, hook settings, provider env, directory MCP.
- `pty/` — the PTY itself: spawn, relay, kill, exit, scan, replay, terminal-mode tracking, tmux size.
- `transcript/` — reading and folding transcripts, the per-agent views, cleared transcripts, last turn,
  prompt history, summary scan.
- `activity/` — working / waiting state, heat, work phase, task pushes, hooks that report activity.
- `list/` — the session list and how a session is found, titled and described.
- `credentials/` — credential announcements, token rotation, limits, the one-session-per-worktree claim.
- `reaping/` — idle reaping, surviving sessions, persist drain.
- `scheduled/` — scheduled and background chats, the translation worker.
- `decisions/` — decision scan and digest.
- `accounts/` — per-account log, MCP and sessions.
- Root keeps the core every group reads: `registry`, `types`, `session-home`, `session-reads`,
  `session-settings`, `session-cwd` and the rest of the session record and its wire frames.

`spawn` and `spawn/agents` import each other at directory level (the spawner table names every agent;
each agent reads the shared deps). It is not a file-level cycle.

`test/server/session/` follows the split for every spec named after a moved module. Specs that
exercise several of them under a scenario name stay flat.

## Verification

`yarn typecheck`, `yarn lint`, `yarn build`, `yarn test`, and a server boot from this checkout.
