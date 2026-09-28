# fix: say Claude Code is too old when it rejects --permission-mode auto (#2352)

## Problem

A claude cell is spawned with `--permission-mode <CLAUDE_PERMISSION_MODE>`, `auto` by default. A
Claude Code too old to know `auto` exits at once with its own argument error:

```
error: option '--permission-mode <mode>' argument 'auto' is invalid. Allowed choices are acceptEdits, bypassPermissions, default, plan.
```

That is our flag being rejected, not something the user typed, so nothing in it says "update
Claude Code". Reproduced with the published 1.0.100 and 2.0.0 packages; 2.1.283 accepts `auto`.

## Change

- `server/agents/claude-permission-modes.ts` (pure):
  - `permissionModeChoices(helpText)` reads the `choices:` list of `--permission-mode` out of
    `claude --help`. Both shapes are real: old versions print it on one line, current ones wrap it
    across several. Anything it cannot read returns null.
  - `permissionModeRefusal(mode, choices, bin)`: null when the choices are unknown or include the
    mode; otherwise the one-line message for the cell. For `auto` it says the Claude Code is too old
    and how to update it (`claude update`, or `npm install -g @anthropic-ai/claude-code@latest` for
    an npm install). For any other mode it names `CLAUDE_PERMISSION_MODE`, since that is where a
    non-default mode comes from.
- `server/agents/claude-help-probe.ts`: runs `<bin> --help` through `resolvePtyLaunchForEnv` (so a
  Windows `claude.cmd` runs the way the spawn runs it), with a timeout, and caches the answer per
  resolved path + mtime — `claude update` replaces the file, so the next cell asks again. Any failure
  (not found, timeout, non-zero exit, unreadable output) is "unknown".
  `refuseUnsupportedPermissionMode(bin, mode)` throws `SpawnPermissionModeError`.
- `server/session/pty-spawn.ts`: `PtySpawnEnv.preflight(childEnv)`, run only for a NEW program,
  right after the existing binary check, with the same child env it resolves against (the server's
  own PATH can find a different `claude`), and on the same reattach answer — so tmux is asked once, and the
  capability probe in spawn-claude stays immediately before the spawn. `SpawnPermissionModeError`
  sits with the other `SpawnRefusedError`s; the existing `startFailureMessage` path already shows
  their message in the cell as-is.
- `server/session/spawn-claude.ts`: `sessionProgram` hands plain claude a `preflight` that asks
  the probe; a custom agent's program gets none.

## Decisions

- **Ask the binary, not a version table.** The first version that accepts `auto` is not in the
  changelog; the help text lists what this binary accepts.
- **Unknown means start as before.** A help call that fails or a list that cannot be read never
  blocks a cell.
- **No silent fallback to another mode** (as the issue says): the cell would open but keep asking
  for permission with no reason given.
- **Skipped for a reattach** (the process is already running) and for a custom agent (its command
  is the user's, and the claude it ends up running is not ours to find).

## Out of scope

`init`'s doctor still ticks any installed `claude` (noted in the issue as out of scope).

## Verification

- Specs over verbatim `--help` excerpts from 1.0.100 (one line) and 2.1.283 (wrapped), plus the
  probe's cache/failure handling with an injected runner, `preflight` (new spawn only, a throw stops
  the spawn) and its wiring (plain claude only).
- A real run of the server with `CLAUDE_BIN` pointing at the 1.0.100 package: the cell shows the
  message instead of the argument error; with the current `claude`, the cell starts as before.
