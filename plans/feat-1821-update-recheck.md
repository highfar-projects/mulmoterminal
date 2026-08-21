# feat(#1821): re-run the update check while the server runs

## The problem, as measured

`refreshUpdateStatus` is called exactly once, from the `app.listen` callback in
`server/index.ts`. Nothing re-runs it. The UI's polling loop (`useUpdateStatus`) is not a
refresh either — it stops the moment `ready` turns true, because until now the answer could
not change without a restart.

That makes the check structurally blind to the install method the README recommends. Verified
on `a71872a1` by running the real functions:

```
npmUpdateNotice("4.10.1", "4.10.1")  ->  null
```

`npx mulmoterminal@latest` resolves the registry's `latest` at the moment it starts, so the
running version *is* `latest` when the only check runs. A release that ships an hour later
would make the comparison say "behind" — but nothing looks again. The header badge and the
console notice therefore have no moment at which they can fire, for the whole life of a server
that is designed to stay up for days (tmux carries sessions across a restart).

Where the badge does work today: `npm i -g` (the running version is pinned at install time) and
a git checkout (compared against `git ls-remote origin HEAD`).

## What this changes

**Server** — a new `startUpdateStatusRefresh()` does the startup check and then repeats it every
3 hours, `unref`'d so the timer never holds the process open. It lives in
`server/config/update-status.ts` rather than in `server/index.ts`: the cadence belongs next to the
thing it refreshes, `server/index.ts` was already at its 600-line lint cap, and an interval buried
in the entry file is unreachable from a test — where it is now, the repeat is covered directly.
Best-effort is unchanged: `refreshUpdateStatus` already swallows a failure and keeps the last
good value, so a tick that cannot reach the registry leaves the badge as it was.

3 hours is the registry-load / immediacy trade-off: 8 requests per day per running server, and
a release is heard about within 3 hours. The opt-outs (`NO_UPDATE_NOTIFIER`,
`MULMOTERMINAL_NO_UPDATE_CHECK`) keep working untouched, because `refreshUpdateStatus` reads
them on every call rather than at module load — so turning one on takes effect on the next tick
instead of needing a restart.

**UI** — `useUpdateStatus` stops treating `ready` as the end of the conversation. The fast poll
(3s x 5) still exists and still does its original job: bridging the startup race, where the
server's own check is still out on the network and an early read is `ready: false`. On top of
it the composable now re-reads on a slow tick through the existing `usePollWhileVisible`, which
also refreshes on `focus` and `visibilitychange` — so a user coming back to the tab sees the
badge immediately rather than at the next tick.

Reusing `usePollWhileVisible` rather than a module-level timer means one timer per consuming
component (the header badge, and the Settings version line while it is open) instead of one for
the module. That is two reads of an in-memory endpoint per tick in the worst case, which is
cheaper than the visibility and focus handling it would otherwise have to re-implement.

The `ready`-based early-out in `startPolling` is replaced by the `polling` guard alone. That
guard is what collapses overlapping loops; keying on `ready` as well is exactly what made the
composable refuse to ask a second time. A consequence worth having: a server RESTART now
recovers too — the slow tick reads `ready: false`, and the fast poll re-arms to chase the new
check.

## Scope

Only approach 1 from the issue. Approach 2 (classifying an `_npx` install separately so the
notice says "stop and start it again" instead of `npm i -g mulmoterminal`) is independent and
stays for its own PR: it changes the `InstallKind` wire type, `parseUpdateStatus`, the UI's
notice parsing and the README API table, none of which this touches.

So an npx user gets the badge after this, with a command line that is still wrong for them.
That is a strictly better position than never seeing the badge at all, and the two halves are
separately revertible.

## Verification

Specs (`yarn test`: 10837 passed):

- `test/server/config/update-status.spec.ts` — a second `refreshUpdateStatus` REPLACES the cached
  answer (the property the interval rests on); the opt-out is re-read per call rather than latched
  at the first one; `startUpdateStatusRefresh` checks at startup AND on the interval, picking up a
  release published after boot; and its timer does not hold the event loop open.
- `test/src/composables/useUpdateStatus.spec.ts` — the composable asks again after the answer has
  landed (the inverse of the assertion this replaces), re-arms the fast poll when a later read
  comes back not-ready, and does not poll while the tab is hidden.

Each new assertion was mutation-checked — restoring the old `ready`-based guard, dropping
`usePollWhileVisible`, removing `.unref()`, and reverting to a startup-only check each turn the
relevant tests red, so none of them pass vacuously.

Run against external ground truth rather than against the specs:

- The real `startUpdateStatusRefresh` driven in a live process registers a 10800000 ms (3 h)
  interval, and the exact callback it holds performs a full real git/registry check.
- `computeUpdateInfo` against the live npm registry, with a simulated
  `~/.npm/_npx/<hash>/node_modules/mulmoterminal` package dir, reproduces the issue and the fix:
  a server running the then-current 4.10.1 gets `notice: null`, while the same code at 4.9.0 gets
  `Update available: 4.9.0 → 4.10.1`. The comparison was never broken — only the second look
  was missing.
- `server/index.ts` boots and `GET /api/update-status` answers
  `{"ready":true,"install":"git","version":"4.10.1","commit":"a71872a1",...}`.

Not verified locally: the interval firing on the real 3-hour clock, and an npx-installed server
end to end (that needs a published release newer than the running one). Both are covered by the
fake-timer spec and the live `computeUpdateInfo` drive respectively.

README's `GET /api/update-status` row said "Computed once at startup"; it no longer is.
