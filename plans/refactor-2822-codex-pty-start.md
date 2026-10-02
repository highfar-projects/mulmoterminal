# refactor: codex spawns through startAgentPty (#2822 follow-up)

## What moves

`server/session/spawn-codex.ts` repeated the block `startAgentPty` (#2845) already owns: the pty
spawn, the start time, the start line, the entry, the `ptys` registration. It was left out of #2845
because codex reads `reattached` from the spawn afterwards, to choose how to tail its rollout.

- `startAgentPty` now also returns `reattached` (the pty's own answer, passed through).
- `spawnCodexPty` calls `startAgentPty` and keeps everything after it as it was.

## Why it preserves behaviour

- Codex: the same `ptySpawn` arguments (program, argv, cwd, `persistent: true`, the same
  `binEnvVar` + env object), then `Date.now()`, then the start line with `agent: "codex"` and the
  resume note, then the same entry registered. The note is a pure string, so building it before
  the spawn instead of after is unobservable.
- The other six callers destructure only `entry` and `spawnedAtMs`; the added field is ignored by
  every one of them, and nothing else in the helper changed.

Checked by running the pre-change `spawn-codex.ts` and `agent-pty-start.ts` beside the new ones in
a throwaway vitest harness over generated inputs (ordered call log, start line, registry, result,
async rollout capture), plus a mutation of each side to confirm the harness goes red. The permanent
part is the `reattached` assertion added to `test/server/session/agent-pty-start.spec.ts`.

## Declined

- A `withSettingsCleanup` around codex's spawn. Codex writes no session file before spawning (its
  seed prompt is typed into the pty after it settles, not passed through `seedPromptArgument`), so
  there is nothing for it to clean. Adding it would be a behaviour change and is out of scope.
