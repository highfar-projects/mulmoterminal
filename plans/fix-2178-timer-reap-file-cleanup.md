# fix: a tick's reaped sessions leave their files behind (#2178)

## The gap

#2167 gave the sweep a second caller — a timer — but only the first one has a follower
that removes what an ended session left on disk.

```
on-listening.ts   →  startReapSchedule()  →  sweepNow()   … then pruneOrphanSettings / pruneOrphanDrops
armTimer's tick   →                          sweepNow()   … then nothing
```

So between a tick ending a session and the next server start, its
`~/.mulmoterminal/settings/<id>.json` survives — and `session-settings.ts` says in its own
words why that matters: a provider session's file holds its API token, which then outlives
the session, a rotation, and the provider being removed from the config.

The condition is not exotic. `sessionReapIntervalHours` is turned on precisely by someone
whose server does not restart, so "until the next boot" is the longest it can be.

## The change

`armTimer`'s tick passes the sweep's reaped ids to `cleanupSessionSettings` and
`cleanupSessionDrops`.

- **Tick only, not boot.** The boot sweep already has its prune, and that prune uses a
  live-peer cutoff (#1061) that only a boot can work out. Adding a per-id delete there
  would go around it.
- **The id is checked before it becomes a path.** The sweep ends ids that are NOT session
  ids on purpose (#1533) and `settingsFile()` joins the id straight onto the settings
  directory. The boot prunes make this check; a second route to the same files needs it.

## Verification

- Specs on the tick: it cleans what it ended, it cleans nothing when it ended nothing, it
  skips an id that is not a session id, and the BOOT half still cleans nothing.
- Both guards break-verified: removing the filter reddens the traversal spec; removing the
  cleanup call reddens both. The file was restored and re-run green between mutations.
- The delete functions are mocked in the spec — the real ones would remove whatever sits
  under the developer's own `~/.mulmoterminal`.

## Not in scope

`POST /api/tmux/cleanup-orphans` sweeps without cleaning up too. That path is user-initiated
and watched, and it is a separate revert unit; #2178 records it.
