# fix: turn psmux's warm pool off (#3166)

## Problem

psmux keeps spare shells in every server (`warm-pool-size`, default three) plus a hidden
`__warm__` standby server, so the next creation can claim one. psmux's own
`docs/warm-sessions.md` says a spawn with `-e` skips the pool, and every cell's `new-session`
carries `-e` (`tmuxNewSessionArgs`). So no spare is ever claimed: they only hold memory, and the
reporter's `PSMUX_WARM_TRACE` shows every client resize kills and restarts them.

## Fix

- `server/infra/process/psmux.ts`: `psmuxGlobalOptions(version)` returns `warm off` for psmux
  3.3.1+ (the first release with the option, psmux#120) and nothing for an older one or an unreadable version,
  since an unknown option would print a config warning into the first pane.
- `server/infra/process/tmux.ts`:
  - `ensureConf` appends those options to the conf on psmux only. A real tmux has no `warm` option.
  - `applyLiveTmuxOptions` sends `set-option -t =mt-<id> -g warm off` to every running session,
    asynchronously on every conf write (idempotent, best effort like the other live options), so an
    unresponsive server cannot hold startup.
    psmux runs one server per session and routes by `-t`, so one bare `set -g` would reach only
    one of them. Setting `warm off` at runtime also kills the `__warm__` server (psmux
    `src/server/options.rs`).

psmux reads `-f` through `PSMUX_CONFIG_FILE`, which is also what `is_warm_disabled_by_config`
reads, so the conf line stops the `__warm__` spawn too.

## Not verified here

No Windows machine: the psmux behaviour rests on psmux's source and the reporter's trace on the
fork's equivalent change. Specs cover the version gate, the conf content and the live call.
