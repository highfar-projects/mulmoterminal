# fix: a server started on another HOME reaches the first server's tmux sessions (#3039)

## Problem

The tmux server name (`-L mulmoterminal`) and the drop directory (`$TMPDIR/mulmoterminal-drops`)
do not depend on `HOME`. A second server started with `HOME=<scratch>` (the screenshot procedure
in CLAUDE.md) therefore:

1. sweeps the first server's idle tmux sessions (`reapIdleSessions` → `tmuxKillSession`) using
   its own default `sessionIdleReapDays`;
2. applies its own live tmux options — including the prefix key — to the first server's tmux
   server (`ensureConf` → `applyLiveTmuxOptions`);
3. cannot see the first server in the instance registry (it lives under `~/.mulmoterminal`), so
   the "newer than a live peer" guard on the boot prune (#1061) does not apply.

Separating only the tmux server would make (3) worse: the second server would see no live
sessions and prune every drop directory of the first one. So both move together.

## Decision

Scope both names by the home directory, but only when `HOME` is overridden:

- `homeScopeSuffix(homeDir, accountHomeDir)` (pure, `server/infra/process/home-scope.ts`):
  `""` when the two resolve to the same path (or the account home is unknown), otherwise
  `-<8 hex of sha256(resolved homeDir)>`.
- `accountHomeDir` is `os.userInfo().homedir` — read from the passwd entry, not `$HOME`.
- tmux server: `mulmoterminal<suffix>`; drops: `mulmoterminal-drops<suffix>`.

The normal case (no override) keeps today's names, so existing sessions reattach with no
migration. An overridden HOME gets its own tmux server and drop directory, which removes all
three effects above at once.

## Not done

- No migration path for someone who already runs with a permanently overridden `HOME`: their
  sessions live on the old `mulmoterminal` server and will not reattach after this change. The
  conversations themselves resume from disk.
