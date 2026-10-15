# feat: Antigravity turn hooks — working dot, finished sound (#3034)

## Goal

An agy cell lights the working dot when a turn starts and, when it ends, raises the attention mark,
plays the sound and sends the "finished" push — through the same `/api/hook` effect tables claude,
cursor and copilot already feed. Settings (sound on/off, push) are the existing ones.

Out of scope: the blocked-on-input signal (no agy event measured for it yet), the header prompt
(agy's hook payloads carry no prompt text), the tool-call history.

## What was measured (agy 1.3.5, interactive TUI, two turns — see the issue comments)

- agy reads `<workspace>/.agents/hooks.json` (`hooks_manager.go: loaded 1 named hooks`).
- Order in one turn: `SessionStart` → `PreInvocation(invocationNum 0)` → `PreToolUse` →
  `PostToolUse` → `PostInvocation` → `PreInvocation(1)` → `PostInvocation` → `Stop`.
  `SessionStart` fires only on the conversation's first turn; `invocationNum` restarts at 0 each turn.
- `Stop` fires exactly once per turn (`terminationReason: "NO_TOOL_CALL"`, `fullyIdle: true`).
- The hook command inherits the agy process's environment, so `MULMOTERMINAL_SESSION_ID` /
  `MULMOTERMINAL_PORT` (guiMcpEnv) reach it.
- **One malformed entry voids the whole file.** Events without a matcher (`SessionStart`,
  `PreInvocation`, `PostInvocation`, `Stop`) take handlers directly —
  `[{"type":"command","command":…}]`. Wrapping them in `{"hooks":[…]}` fails with
  `command hook must specify 'command'`.

## Design

- `server/agents/antigravity/antigravity-hook.ts` (pure): the two registered events, the constant
  command per event (session and port from the environment, as codex's PermissionRequest hook),
  and `antigravityHookBody` — `PreInvocation` with `invocationNum === 0` → `UserPromptSubmit`,
  `Stop` → `Stop`, anything else → null. No `session_id` in the body: agy's `conversationId` is not
  ours; the session comes from the `x-mt-session` header.
- `server/agents/antigravity/antigravity-hooks-file.ts`: merge our named hook (`mulmoterminal`) into
  `.agents/hooks.json` beside the user's, never touching theirs; a file that is not a JSON object is
  left alone; symlink guard and `.git/info/exclude`, as `skills.json` / `mcp_config.json`.
- `spawn-antigravity.ts` calls the sync; not on Windows (the command needs `sh`).
- `hook-routes.ts`: `antigravity` joins `TRANSLATE_HOOK`.

The file holds no port and no session, so it is safe to leave in place: outside a MulmoTerminal
session `MULMOTERMINAL_SESSION_ID` is unset and the command posts nothing.

## Verification

- Specs for the translation, the merge, and the sync.
- End to end: a real agy cell on a dev server, one turn, and the server log shows
  `[hook] UserPromptSubmit` / `[hook] Stop` for that session.
