# clone-ask (fork-only)

A Claude Code skill that lets the session in one clone ask the session open in another clone, and read
its answer. It goes through the external ask routes (`plans/feat-external-ask.md`) by way of
`scripts/external-ask.mjs`.

Not a bundled skill: MulmoTerminal does not ship or mirror it. Install it by hand on each side that
should use it.

## Before installing

The external ask routes are off until `~/.mulmoterminal/external-ask.json` turns them on, and only the
folders in its `allowDirs` (and below) can be asked:

```json
{ "enabled": true, "allowDirs": ["D:/Users/<you>/workspace"], "label": "edgar" }
```

A server in WSL reads its own `~/.mulmoterminal`, so it needs its own file, with POSIX paths. The token
is made on the first request after the routes are on.

## Install

From the repository root, on each side (Git Bash on Windows, a shell in WSL):

```bash
mkdir -p ~/.claude/skills/clone-ask
cp tools/clone-ask/SKILL.md scripts/external-ask.mjs ~/.claude/skills/clone-ask/
```

Copy them again after either file changes. A session started before the copy may need restarting to
see the skill.

## Check

```bash
node ~/.claude/skills/clone-ask/external-ask.mjs --list
```

Run inside a MulmoTerminal cell, this lists the sessions on that side and marks the one it runs in
with `[this session]`. Outside a cell, pass `--port` (the server's port).

## Limits

- A Windows session reaches only Windows sessions and a WSL session only WSL sessions. The two servers
  are separate and have separate tokens.
- A request is one paragraph of at most 3960 characters.
- Every request is tagged and logged with the `label` from the settings, `edgar` by default, whoever
  sent it.
