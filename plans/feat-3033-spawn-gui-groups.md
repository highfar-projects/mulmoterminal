# feat: narrow the GUI MCP of a spawnBackgroundChat session by tool group (#3033)

## Goal

`POST /api/plugin/spawnBackgroundChat` accepts an optional `guiGroups`. Omitted keeps today's
behaviour (every GUI tool). `[]` means no GUI tool at all; a subset means only those groups. The
restriction holds across a cell reattach, a cell restart and a cold resume.

The guarantee is "not offered, not pre-approved", not a sandbox: `/api/plugin/:toolName` and the
session header are still callable directly by anything with a shell.

## Decisions (from the issue)

1. **Enforced in the MCP routes.** Spawn arguments alone do not hold: a cold resume reconnects
   with `?gui=0` and claude loads the worktree's own `.mcp.json` group servers, which a restriction
   in argv cannot see.
2. **Claude only.** Any other agent with `guiGroups` is refused rather than spawned with every tool.
   agy / grok / cursor keep their groups in a file shared with every session in the directory, so a
   per-session restriction there would change their neighbours.
3. **Not advertised on the MCP tool.** The tool's schema mirrors MulmoClaude and already omits
   `agent` / `project` / `draft`; the route reads the field from any caller. Advertising it would
   grow every session's tool listing for a field only a coordinator over HTTP uses today.
4. **Scope stays "not offered, not pre-approved".**

## Design

- `parseBackgroundChat`: `guiGroups` absent → `null` (unrestricted). An array of known groups →
  deduplicated list. Anything else refuses the whole request — falling back to "absent" would
  hand out every tool.
- A per-session restriction log (`gui-group-restrictions.jsonl`), append-only like the
  custom-agent log; the newest line for a session wins. Never erased, like that log: the
  transcript it describes outlives the pty.
- `spawnClaudePty({ guiGroups })` records the restriction before spawning. Every claude spawn then
  reads it back: a restricted session never carries the all-tools url (its claim is released even
  in the workspace), is handed exactly its groups as `--mcp-config`, and pre-approves only those
  groups' tools.
- `mcp/tool-gate.ts`: both layers take the restriction — a tool outside the allowed groups (and
  every ungrouped tool) is neither offered nor dispatched, on the all-tools url and on group urls.
- `mcp-routes.ts`: a restricted session reaching the all-tools url is not recorded as carrying all
  tools, and a group url outside its restriction is not learned (so the Canvas gate follows it).
  Both routes wait for the log's hydration, so a request right after a restart is not served
  unrestricted.
