# refactor: one PTY start for the agent spawners (#2822)

## What is extracted

`server/session/agent-pty-start.ts` — `startAgentPty(start)`: `ptySpawn` → `Date.now()` → the
start line → the `PtyEntry` → `ptys.set`, returning `{ entry, spawnedAtMs }`. Every per-agent
choice is a parameter: `agent`, `file`, `args`, `spawnEnv` (passed to `ptySpawn` as-is), `note`.
The caller keeps its own `withSettingsCleanup` around the call, and keeps everything it computes
before it (env, argv, claims, entitlements) where it was.

Callers: copilot, cursor, muse, claude directly; grok and antigravity through
`startDirectoryMcpPty`, which now only builds the guiMcpEnv spawn env and the resume note.

## Why it preserves behaviour

An old-vs-new harness (the pre-change spawner files copied verbatim beside the new ones, every
boundary module mocked to record calls) drove each spawner over generated inputs — session id,
cwd, resume id, seed prompt, tool groups, attachGuiMcp, reattach, tmux, pid, `ptySpawn` throwing,
the start line's `console.log` throwing — and compared the whole ordered call log (ptySpawn
arguments, Date.now, log lines, `ptys.set` payloads, cleanup entry/run, relay wiring) and the
result. copilot, cursor, grok and antigravity: identical on every input. Two deliberate
differences, both confined:

- **claude** — `spawnedAtMs` is now read right after `ptySpawn`, before the start line is
  logged, instead of after; and `ptys.set` runs inside the cleanup's `try`. Identical once
  Date.now's position is ignored.
- **muse** — its cleanup used to wrap only `ptySpawn`; it now wraps the start line and the
  registration too, as the other spawners' already did. Differs only on inputs where the start
  line's `console.log` throws: the new code then also removes the session's files.

`test/server/session/agent-pty-start.spec.ts` keeps the generator and the property (choices
reach the pty and registry unchanged; order ptySpawn → now → log; nothing registered on a throw).

## Declined

- **codex** (`spawn-codex.ts`) repeats the same block but has no `withSettingsCleanup` and reads
  `reattached` afterwards; sharing it would widen the helper's return for one caller and was
  outside this cluster. Costed follow-up: return `reattached` too, and prove codex the same way.
- **shell / collection** spawners: a different start (no agent, launcher note, not this block).
