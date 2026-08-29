# feat: restart the agent inside a cell (#1918)

Restart the agent process in the cell it is already running in — same cell, same directory,
same agent, same conversation — without going back to the launcher.

## Why the launcher detour exists today

A session cell offers only **Close**. Changing an MCP registration, editing
`~/.mulmoterminal/config.json` or updating a plugin therefore costs: close → pick the directory
and the agent again in the launch form → find the conversation in "or resume here". The app tells
people to do this (`CellChromeButtons.vue`'s Canvas tooltip says "restart this cell",
`server/session/session-tool-groups.ts` says the same about tool groups) and gives them no way to.

## What tmux does, and why it decides the shape

Sessions run inside our own tmux server (`-L mulmoterminal`, session `mt-<id>`). Reconnecting to a
live tmux session **attaches** it (`tmux new-session -A`) — `server/session/pty-spawn.ts:92-100`:

> on the attach path nothing is re-read, because nothing is re-started.

So a "cheap restart that keeps tmux alive" is not a restart at all: it is precisely the no-op this
feature exists to avoid. Restart must reap — kill the pty **and** the tmux session — and let the
next connect spawn a new process:

- `reap()` kills the pty then `tmuxKillSession(id)` (`server/session/lifecycle.ts:190-196`)
- `POST /api/session/:id/terminate` does that, plus killing a tmux orphan directly
  (`server/infra/tmux-routes.ts:29-36`)
- reconnecting with the same id then spawns fresh, and `spawnClaudePty` picks `--resume` when a
  transcript exists (`server/session/spawn-claude.ts:212-215`)

**No server change.** Every route this needs is the close button's.

Two consequences, both accepted (recorded on the issue):

1. **It costs a cold resume.** The conversation is re-read from the transcript, with the token cost
   that implies — the inverse of the reattach the connection manager normally protects
   (`src/composables/useTerminalConnections.ts` header comment). Restart is not fast, so the
   shortcut is not bound by default and the docs say what it costs.
2. **The reap must be awaited before reconnecting.** Otherwise the new WebSocket can reach the
   server before the reap and `new-session -A` attaches the OLD process — a restart that silently
   changes nothing, which is the worst possible failure here. `teardown()` fires the same request
   without awaiting it (`TerminalCell.vue:798`); restart waits.

## Not on the cell header — only where someone asked for it

Most people never need this, so `CellChromeButtons.vue` is left alone. Two opt-in surfaces:

### A configurable header button

`server/config/header-config.ts`'s `buttons`, which is already the "put what you want on the
terminal header" surface. `run` gains a fourth type:

```json
{ "id": "restart", "icon": "restart_alt", "label": "Restart the agent", "run": "action", "action": "restart" }
```

`run: "action"` + an `action` enum rather than `run: "restart"`: a run type says HOW a button acts
(type into the session / run a command / open something / act on this cell), and burning one per
action name means the next in-app action (`clear`, `park`) adds another. It is NOT in
`DEFAULT_BUTTONS`, so nothing changes for anyone who has not written it.

### A keyboard shortcut

`terminal-restart` in `KEYMAP_ACTIONS`, and in `NEEDS_A_CURRENT_TERMINAL` because it acts on a
terminal the grid has to be able to name. `keymap` has no defaults, so again: only for the person
who wrote it.

## The client path

Restart is `teardown()`'s reap followed by a reconnect that keeps everything else:

```
await reapSession(id)      // POST /api/session/:id/terminate — awaited (see above)
connectKey.value++         // Terminal.vue retargets the SAME target → connect() → same id
```

`connectKey++` rather than `resumeSession()` on purpose. `resumeSession` is the launcher's
"attach to a session someone picked" path: it re-emits the agent with `customAgent: null`, which
would drop a session started through a custom agent from the cell's own state. A restart changes
nothing about the cell, so it changes nothing about the cell. `retarget` reconnects with the same
session id, and `connect()` already resets the xterm and clears the previous process's mouse modes.

`conn.terminate()` is deliberately NOT used: it releases the slot (disposes the xterm, removes the
host element), after which `retarget` is a no-op and the cell would go blank.

The ordering rule lives in `src/composables/restartSession.ts` as a pure function over injected
steps, so the "reap before reconnect" invariant is testable without a server or a DOM.

Two callers, one seam: `src/composables/useCellRestart.ts` — a per-slot registry (`cell-<uid>`)
that TerminalCell registers itself in, mirroring `useNewTerminal`'s seam. A Map rather than the
shared handler queue: a restart names ONE terminal, and a request for a cell that is not mounted
has nowhere to go.

## Files

- `server/config/config-schema.ts` — `ACTION_TARGETS`, `"action"` in `RUN_TYPES`, `action` field
- `server/config/header-config.ts` — payload rule for `run: "action"`, `ResolvedButton.action`
- `server/config/header-resolve.ts` — carry `action` through
- `src/composables/restartSession.ts` (new) — the ordering rule + the reap request
- `src/composables/useCellRestart.ts` (new) — the per-cell seam
- `src/composables/useHeaderButtons.ts` — wire type + guard
- `src/composables/useHeaderAction.ts` — dispatch `run: "action"`
- `src/components/TerminalCell.vue` — `restart()`, registered on the seam
- `common/keymap.ts`, `src/components/keymapLabels.ts`, `src/i18n/{en,ja}.ts`,
  `src/components/GridView.vue` — the shortcut
- `server/skills/mulmoterminal-header/SKILL.md`, `server/skills/mulmoterminal-keys/SKILL.md`,
  `docs/guide/{en,ja}/config.md`, `docs/guide/{en,ja}/header.md`

## Decisions taken with the user

1. **Resume, never a fresh conversation.** Opening a new one is `launchIn()` and can be a separate item.
2. **claude + codex verified by hand**; antigravity / grok take the same terminate → reconnect path.
3. **No confirmation**, even mid-turn. The button and the key both belong to someone who wrote them
   into their own config.

## Verification

- Vitest: the ordering rule, the `action` button through the real loader/resolver, the new keymap
  action through `validateKeymap`, the doc samples (`doc-button-samples.spec.ts` already runs every
  documented `buttons` block through `sanitizeButtons`).
- By hand, against a running server: a claude cell and a codex cell, restarted from the button and
  from the key — the conversation comes back, and a `.mcp.json` change made mid-session is live
  after the restart (the whole point). What a green suite cannot show here is the tmux race, so the
  restart is also driven on a cell whose socket is already disconnected.
