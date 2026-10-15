# feat: narrow a codex / copilot spawnBackgroundChat session's GUI MCP by tool group (#3033)

The claude half shipped in #3050 (`plans/feat-3033-spawn-gui-groups.md`). This extends `guiGroups`
to the two other agents that take their GUI MCP per spawn.

## What already holds for them

- **Enforcement** is in the MCP routes and keyed by the session id in the url, not by agent. codex
  and copilot reach the same `/api/mcp/<sessionId>` and `/api/mcp/<group>/<sessionId>` urls, so a
  recorded restriction already filters what they are offered and what they may call.
- **The full-tools claim** is released by `spawnWithFullGuiClaim({ restricted })`, which both
  spawners already go through.
- **Every spawn path** (seeded chat, cell, reattach, resume, issue session) ends in
  `spawnCodexPty` / `spawnCopilotPty`, so reading the record there covers all of them.

## Change

- `parseBackgroundChat` accepts `guiGroups` for claude, codex and copilot. agy / grok / cursor /
  muse stay refused: their groups live in a file in the directory, shared by every session there.
- `spawnCodexPty` / `spawnCopilotPty` take `guiGroups`, record it, and read the record back on
  every spawn. A restricted session never carries the all-tools url and is handed exactly its
  groups (`codexGuiMcpServers({ groups: restriction, allTools: false })`), whatever the directory
  registered. Pre-approval follows for the GUI tools: codex approves per server, and a GUI tool
  outside the groups is never offered to copilot, so its `--allow-all-tools` cannot approve it.
  That flag still approves the user's own MCP servers and copilot's built-ins, as it does for
  every copilot session — narrowing it would block a background worker on every shell command,
  which is a product decision outside #3033.
- `handleCodexConnection` / `handleCopilotConnection` await the restriction log before spawning,
  as the claude handler does: a resume right after a restart would otherwise be handed every tool.
- `plugin-routes.ts` passes `guiGroups` to both.

## The codex-only gap: a resume under the rollout id

The launcher's "resume here" list shows codex rows by codex's own rollout id. Opening an ended
restricted worker from it resumes with `sessionId = rolloutId`, a key the restriction was never
recorded under, so it would start with every tool.

`inheritedGuiRestriction(rolloutId, conversations, restrictionOf)` (pure,
`server/session/spawn/agents/inherited-gui-restriction.ts`): the restriction of the sessions
recorded as holding that rollout, intersected when there are several (narrowest wins), null when
none of them was restricted. The codex spawner records the result under the new key before
spawning, so the MCP routes see it like any other restriction.

copilot has no such gap: `--session-id` is our own id on both new and resume.

## Not done

- The guarantee stays "not offered, not pre-approved", as in #3050: the tools remain callable over
  HTTP by anything with a shell.
- Cross-process: the restriction log (and codex's rollout map) is read at boot only, so a session
  restricted by another live MulmoTerminal sharing `~/.mulmoterminal` is unknown here — for every
  agent since #3050. That setup is warned about as unsupported at boot.
- A codex rollout is listed before its mapping is written (the watcher polls once a second after
  the first turn starts). Opened from the list inside that window it resumes unrestricted — and
  would start a second codex on a live rollout regardless of #3033. An unmapped rollout cannot be
  restricted by default: one started outside MulmoTerminal looks the same.
