# refactor: group server/agents into subdirectories (#2944)

## Goal

`server/agents/` was one flat directory. File names already carried the grouping, so make it
directories. Files are moved, never renamed or edited; only import specifiers and path mentions change.

## Layout

- `claude/ codex/ cursor/ copilot/ grok/ muse/ antigravity/` — everything specific to one agent CLI.
- `probe/` — the usage-probe session, stall and transcript helpers.
- `rate-limit/` — the rate-limit store, probe, service and routes (account limits included).
- `token/` — token assignment, choice, rotation and secret handling.
- `mcp/` — the GUI MCP bridge and the shared MCP config-file writer.
- Root keeps what several agents share: `registry`, `types`, `agent-*`, `bounded-cache`, `owned-file`,
  `git-exclude`, `machine-global-hooks`, `statusline`, `usage-count` and the like.

`test/server/agents/` mirrors the same split.

## Method

A throwaway script resolves every relative specifier (`.js`, extensionless, `.mjs`, `vi.mock`,
dynamic `import()`) against the importer's OLD location, and rewrites it only when the importer or
the target moved. Files move with `git mv` so history follows. Path mentions in comments, README,
CLAUDE.md and the docs are rewritten by a second pass; ChangeLog, plans and dated guide pages are
history and are left alone.

## Verification

- `yarn typecheck` resolves every import (the root tsconfig covers app, server, node and both spec projects).
- `yarn lint`, `yarn test`, `yarn build`.
- Start the server and load a page, since a path read at runtime (`gui-mcp-bridge` resolves
  `mcp/bridge.mjs` from its own URL) is invisible to the type checker.

## Follow-ups

Same method for `session`, `backends`, `config`, `infra`, one directory per PR.
