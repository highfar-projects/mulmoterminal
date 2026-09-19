# fix(#2161): the exit path waits for what it owes the disk

## Reproduced before designing anything, because the issue said it had not been

A child process that queues appends and then leaves the way `shutdown.ts` leaves, against a
control that drains first:

| run | file created | lines | bytes |
|---|---|---|---|
| synchronous `process.exit(0)` (today) | **no** | **0 / 20** | **0** |
| `await whenToolGroupsPersisted()` first | yes | 20 / 20 | 880 |

Not a partial loss — a burst at exit is lost **whole**, because `process.exit` runs before the
first `.then` gets a microtask. The file is not even created.

The first version of that harness showed nothing in **either** arm: the ids were not UUIDs, so
`SESSION_ID_RE` rejected every append. The control is what caught it. A harness with only the
failing arm would have "confirmed" the bug while measuring nothing.

## Why the issue's proposal is not enough

It proposes awaiting `whenToolGroupsPersisted()`. That is **one** queue.
`server/session/registry.ts` holds **ten** fire-and-forget persist chains — lines 175, 268, 365,
531, 564, 668, 707, 777, 830, 931 — writing ten separate files under `~/.mulmoterminal`, and only
two have a waiter at all. Draining one leaves nine losing their tail, and the next person files
this issue again about a different file.

Two things the issue listed as unchecked, now checked: `stopWhisperSidecar()` is **synchronous**,
so it carries no version of this problem; and the parent's `shutdown` in `bin/mulmoterminal.js` is
exactly as quoted.

## The shape

`server/session/persist-drain.ts` is a tracker: a queue registers **how to read its tail**, and
one function awaits them all under a cap.

**A getter, not the promise** — that is the load-bearing detail. Every append REPLACES the chain
(`persist = persist.then(...)`), so a promise handed over at registration is the empty tail that
existed before any work. Awaiting it would resolve instantly and look exactly like success. The
spec pins this directly, because it is the one "simplification" that would silently undo the fix.

The append paths themselves are untouched. Ten one-line registrations, nothing else.

## Where the waiting happens

- `server/infra/shutdown.ts` — the signal path becomes async: kill the sidecar (sync, and it must
  not outlive us either way), drain under a cap, exit. The `exit` handler stays synchronous and
  drains nothing, because by then the event loop is over — which is why the signal path is the one
  that matters. It is also the path the browser's stop button takes
  (`shutdown-routes.ts` → `process.kill(pid, "SIGTERM")`), so the guarantee that the button does
  what Ctrl+C does is preserved rather than forked.
- `bin/mulmoterminal.js` — the parent waited for nothing. It now waits for the child's `close`,
  capped, so the shell does not come back before the flush and the child is not cut off with the
  terminal. A second Ctrl+C means "stop waiting". Extracted to `installParentShutdown` because
  inlining it pushed `main` over the repo's function-length bound — and the extraction is what
  makes it testable.

**The cap exists because losing the tail is the lesser failure.** A disk that has stopped
answering must not turn Ctrl+C into a hang; a server nobody can stop is worse than a truncated
log. When the cap fires the exit path says so, so an operator can tell a clean stop from a
truncated one.

## Verification

End to end, through the real `installShutdownHandlers()` and a real `SIGINT` to self:

| | file | lines | bytes |
|---|---|---|---|
| before | no | 0 / 20 | 0 |
| after | yes | **20 / 20** | **880** |

Break-verified, source restored byte-identical after each:

- an eleventh chain added to `registry.ts` without registering it → red (this is the guard that
  matters most: it derives the chain list from the source, so it fails CLOSED)
- the drain awaiting only the first queue → red
- the cap never firing → red
- a rejected queue aborting the drain instead of being absorbed → red

**One of those mutations passed at first, and that is worth recording.** The "waits for every
queue" test flushed a single microtask before asserting, which is not enough to tell "waits for
all" from "waits for the first" — `allSettled` resolves a few ticks later either way. It now
drains the macrotask queue instead. The test was green for the wrong reason until the mutation
said so.
